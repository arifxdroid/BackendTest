import express, { Request, Response, Router } from 'express';
const router = express.Router();
import Category from '../models/categoryModel';
import ICategory from '../interfaces/category';

import bodyParser from 'body-parser';
const urlencodedParser = bodyParser.urlencoded({ extended: false });



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
        res.send(category);
    }
    catch (err) {
        return res.status(500).send(err);
    }
});

// get all categories
router.get('/categories', async (req: Request, res: Response) => {

    try {
        let doc: ICategory[] = await Category.find()
            .populate('childCategories')
            .exec();

        res.send(doc);
    }
    catch (err) {
        return res.status(500).send(err)
    }
});


// get a category by ID
router.get('/categories/:id', async (req: Request, res: Response) => {
    try {
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
        res.send(category);

    } catch (err) {
        res.status(500).send(err);
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
            // update all documents using the updateMany method
            await Category.updateMany({ _id: { $in: categoryIds } }, { $set: { isActive: category.isActive } }, { new: true }).exec();
        }

        await category.save();
        res.send(category);

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

        res.send('Category deleted');
    } catch (err) {
        res.status(500).send(err);
    }
});


module.exports = router;