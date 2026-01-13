import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import { Book } from "../models/book.model.js";
import ErrorHandler from "../middlewares/errorMiddlewares.js";


export const addBook = catchAsyncErrors (async (req, res, next) => {
    const { title, author, description, price, quantity } = req.body;
    if (!title || ! author || ! description || !price || ! quantity) {
        return next(new ErrorHandler("Please fill all fields.", 400));
    }
    const book = await Book.create({
        title,
        author,
        description,
        price,
        quantity,
    });
    res.status(201).json({
        success: true,
        message: "Book added successfully.",
        book,
    });
});


export const getAllBooks = catchAsyncErrors(async (req, res, next) => {
    const {
        search,
        availability,
        minPrice,
        maxPrice,
        sort = "newest",
        page = 1,
        limit,
    } = req.query;

    const filters = {};

    if (search) {
        const keyword = String(search).trim();
        if (keyword) {
            const regex = new RegExp(keyword, "i");
            filters.$or = [{ title: regex }, { author: regex }];
        }
    }

    if (availability === "true" || availability === "false") {
        filters.availability = availability === "true";
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
        filters.price = {};
        if (minPrice !== undefined && minPrice !== "") {
            filters.price.$gte = Number(minPrice);
        }
        if (maxPrice !== undefined && maxPrice !== "") {
            filters.price.$lte = Number(maxPrice);
        }
    }

    const sortOptions = {
        newest: { createdAt: -1 },
        price_asc: { price: 1 },
        price_desc: { price: -1 },
        quantity_asc: { quantity: 1 },
        quantity_desc: { quantity: -1 },
    };

    const sortBy = sortOptions[sort] || sortOptions.newest;

    const totalBooks = await Book.countDocuments(filters);
    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = limit ? Math.max(Number(limit), 1) : 0;
    const totalPages = limitNumber ? Math.max(Math.ceil(totalBooks / limitNumber), 1) : 1;
    const currentPage = limitNumber ? Math.min(pageNumber, totalPages) : 1;

    let query = Book.find(filters).sort(sortBy);

    if (limitNumber) {
        const skip = (currentPage - 1) * limitNumber;
        query = query.skip(skip).limit(limitNumber);
    }

    const books = await query;

    res.status(200).json({
        success: true,
        books,
        totalBooks,
        page: currentPage,
        limit: limitNumber || totalBooks,
        totalPages,
    });
});

export const deleteBook = catchAsyncErrors (async (req, res, next) => {
    const { id } = req.params;
    const book = await Book.findById(id);
    if (!book) {
        return next(new ErrorHandler("Book not found.", 404));
    }
    await book.deleteOne();
    res.status(200).json({
        success: true,
        message: "Book deleted successfully.",
    });
});