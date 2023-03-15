import { Document } from 'mongoose';

interface ICategory extends Document {
    name: string;
    parentCategory: ICategory['_id'] | null;
    childCategories: ICategory['_id'][];
    level: number;
    isActive: boolean;
}

export default ICategory;