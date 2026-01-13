import mongoose from "mongoose";

const bookSchema = new mongoose. Schema ({
    title: {
        type: String,
        required: true,
        trim: true
    },
    author: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
    },
    price: {
        type: Number,
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
    },
    availability: {
        type: Boolean,
        default: true,
    },
    holdCount: {
        type: Number,
        default: 0,
    },
},
{
timestamps: true,
}
);

export const Book = mongoose.model("Book", bookSchema);