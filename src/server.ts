import express from "express";
import bodyParser from "body-parser";
// import cors from "cors";
import mongoose from "mongoose";
import redisClient from "./helpers/redisHelper"
import dotenv from "dotenv";

dotenv.config();

// Create Express.js app
const app = express();

// Middleware
app.use(bodyParser.json());
// app.use(cors());

// Connect to MongoDB
const mongoseOptions: any = {
  useNewUrlParser: true
}

mongoose.connect(process.env.MONGODB_URI as string, mongoseOptions).then(() => {
  console.log("Connected to MongoDB");
})
.catch((err) => {
  console.log(err);
});


// Routes
app.get("/", (req, res) => {
  res.send("Hello, world!");
});
app.use('/', require('./routes/categoryRoutes'));

// Start server
app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
