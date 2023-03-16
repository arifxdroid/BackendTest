import express, { Request, Response, Router } from 'express';
const router = express.Router();
import Category from '../models/categoryModel';
import ICategory from '../interfaces/category';
import redisClient from '../helpers/redisHelper';

import bodyParser from 'body-parser';
const urlencodedParser = bodyParser.urlencoded({ extended: false });

/**
 * Parse boolean value
 * @param val any
 * @param defVal boolean
 * @returns boolean
 */
const parseBoolean = function (val: any, defVal: boolean) {

    if (val === null || val === undefined)
        return defVal;

    if (typeof val === 'boolean')
        return val;
    if (typeof val === 'string') {
        val = val.toLocaleLowerCase();
        if (val === 'true')
            return true;
        if (val === 'false')
            return false;
        if (val === '0')
            return false;
        if (val === '1')
            return true;
        if (val === 'no')
            return false;
        if (val === 'yes')
            return true;
    }
    if (typeof val === 'number') {
        return val !== 0;
    }
    return defVal;
}

/**
 * Get all categories from database
 * @returns ICategory[]
 */
const getAllCategories = async function() {

    try{
        let doc: ICategory[] = await Category.find()
        .populate('childCategories')
        .exec();
    
        return doc;
    }
    catch(err){
        console.log(err);
        return null;
    }
}

/**
 * Set or update key value in redis cache
 * @param key string
 * @param value object
 */
const redisSetOrUpdate = async function(key:string, value:object|any){
    await redisClient.connect();
    await redisClient.set(key, JSON.stringify(value), 'EX', 300);
    redisClient.quit();
}

/**
 * Clear the key|keys from redis cache
 * @param keys string|string[] 
 */
const redisClearKeys = async function(keys:string|string[]){
    await redisClient.connect();
    await redisClient.del(keys);
    redisClient.quit();
}


// define routes for the REST API

// create a category
router.post('/categories', urlencodedParser, async (req: Request, res: Response) => {

    let name: string = req.body.name;
    if(!name){
        return res.status(500).send('Category name is required');
    }
    const category = new Category({
        name: name,
        parentCategory: req.body.parentCategory,
        childCategories: [],
        level: 0,
        isActive: true
    });

    try {
        await category.save()

        const doc = await getAllCategories()
        await redisSetOrUpdate('categories', doc) // store data in Redis

        return res.send(category);
    }
    catch (err) {
        return res.status(500).send(err);
    }
});

// get all categories
router.get('/categories', async (req: Request, res: Response) => {

    try {

        // check if data exists in Redis
        await redisClient.connect();
        const categories = await redisClient.get('categories');
        redisClient.quit();

        if (categories) {
            console.log('Returning categories from Redis');
            return res.send(JSON.parse(categories));
        }

        const doc = await getAllCategories()
        await redisSetOrUpdate('categories', doc) // store data in Redis

        return res.send(doc);
    }
    catch (err) {
        return res.status(500).send(err)
    }
});


// get a category by ID
router.get('/categories/:id', async (req: Request, res: Response) => {
    try {

        // check if data exists in Redis
        await redisClient.connect();
        const categoryExist = await redisClient.get(`category_${req.params.id}`);
        redisClient.quit();

        if(categoryExist !== null){
            return res.send(JSON.parse(categoryExist));
        }

        const category = await Category.findById(req.params.id).populate('childCategories').exec();
        if (!category) {
            return res.status(404).send('Category not found');
        }

        async function populateParentCategory(category: ICategory) {
            if (!category.parentCategory) {
                return;
            }
            const parentCategory = await Category.findById(category.parentCategory).exec();

            if (!parentCategory) {
                throw new Error('Parent category not found');
            }
            category.parentCategory = parentCategory;

            await populateParentCategory(parentCategory);
        }

        await populateParentCategory(category);
        await redisSetOrUpdate(`category_${req.params.id}`, category) // store data in Redis
        return res.send(category);

    } catch (err) {
        return res.status(500).send(err);
    }
});


// update a category by ID 
router.put('/categories/:id', urlencodedParser, async (req: Request, res: Response) => {
    try {
        const category = await Category.findById(req.params.id).populate('childCategories').exec();

        if (!category) {
            return res.status(404).send('Category not found');
        }

        // update the category properties
        let isSame = true;
        if(req.body.isActive){
            let isActive:boolean = parseBoolean(req.body.isActive, false);
            isSame = category.isActive == isActive;
        }
        let redisKeys:string[] = ['categories', `category_${req.params.id}`]; // Keys need to clear from redis


        category.name = req.body.name || category.name;
        category.isActive = req.body.isActive || category.isActive;


        if(!isSame){ // if isActive value is changed then look for the child
            const result = await Category.aggregate([
                {
                  $match: { name: category.name } // match the category with the name
                },
                {
                  $graphLookup: {
                    from: "categories",
                    startWith: "$_id",
                    connectFromField: "_id",
                    connectToField: "parentCategory",
                    as: "childCategories",
                    maxDepth: 10 // maximum depth to search
                  }
                },
                {
                  $unwind: "$childCategories"
                },
                {
                  $set: {
                    "childCategories.isActive": category.isActive // set the isActive field to true/false
                  }
                },
                {
                  $project: {
                    _id: "$childCategories._id",
                    name: "$childCategories.name",
                    parentCategory: "$childCategories.parentCategory",
                    level: "$childCategories.level",
                    isActive: "$childCategories.isActive"
                  }
                }
            ]).exec();
              
            if(result){
    
                const categoryIds = result.map(category => category._id);
                await Category.updateMany({ _id: { $in: categoryIds } }, { $set: { isActive: category.isActive } }, { new: true }).exec();  // update all documents using the updateMany method
    
                categoryIds.forEach(id => {
                    redisKeys.push(`category_${id}`);
                });
            }
        }

        await category.save();
        await redisClearKeys(redisKeys); // Clear keys from redis cache

        return res.send(category);

    } catch (err) {
        res.status(500).send(err);
    }
});


// delete a category
router.delete('/categories/:id', async (req: Request, res: Response) => {
    try {
        const category = await Category.findById(req.params.id);

        if (!category) {
            return res.status(404).send('Category not found');
        }
        await Category.deleteOne({ _id: req.params.id });

        let redisKeys: string|string[] = ['categories', `category_${req.params.id}`];
        await redisClearKeys(redisKeys); // Clear keys from redis cache

        return res.send('Category deleted');
    } catch (err) {
        res.status(500).send(err);
    }
});


module.exports = router;