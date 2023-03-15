import mongoose, { Document, Model, Schema } from 'mongoose';
import ICategory from '../interfaces/category';


const categorySchema: Schema<ICategory> = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  parentCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  childCategories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],
  level: {
    type: Number,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
});

categorySchema.pre<ICategory>('save', async function (next) {
  try {
    if (this.parentCategory) {
      const parentCategory = await Category.findById(this.parentCategory).exec();
      if (!parentCategory) throw new Error('Parent category not found');
      if (parentCategory.level + 1 > 4) {
        throw new Error('Cannot nest categories more than 4 levels deep.');
      }
      this.level = parentCategory.level + 1;
      next();
    } else {
      this.level = 1;
      next();
    }
  } catch (err: any) {
    next(err);
  }
});

const Category: Model<ICategory> = mongoose.model<ICategory>('Category', categorySchema);

export default Category;
