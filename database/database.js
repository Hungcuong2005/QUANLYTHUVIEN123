import mongoose from "mongoose";

export const connectDB = () => {
    mongoose.connect(process.env.MONGO_URL, {
        dbName: "QUAN_LY_THU_sVIEN",  
    })
    .then(() => {
        console.log(`KET NOT DATABASE THANH CONG`);
    })
    .catch((err) => {
        console.log(`KET NOI DATABSE THAT BAI`, err);
    });
}

