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
router.put('/categories/:id', async (req: Request, res: Response) => {
    try {
        const category = await Category.findById(req.params.id).populate('childCategories').exec();

        if (!category) {
            return res.status(404).send('Category not found');
        }

        // update the category properties
        category.name = req.body.name || category.name;
        category.parentCategory = req.body.parentCategory || category.parentCategory;
        category.isActive = req.body.isActive || category.isActive;

        // recursively update the child categories' isActive property
        async function updateChildCategories(category: ICategory, isActive: boolean) {
            for (let childCategory of category.childCategories) {
                childCategory.isActive = isActive;
                await childCategory.save();
                await updateChildCategories(childCategory, isActive);
            }
        }

        // deactivate all child categories if the category is being deactivated
        if (!category.isActive) {
            await updateChildCategories(category, false);
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