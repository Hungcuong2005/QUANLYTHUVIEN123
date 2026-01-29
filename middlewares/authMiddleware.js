import { catchAsyncErrors } from "./catchAsyncErrors.js";
import ErrorHandler from "./errorMiddlewares.js";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";


export const isAuthenticated = catchAsyncErrors(async (req, res, next) => {
  const { token } = req.cookies;
  if (!token) return next(new ErrorHandler("User is not authenticated.", 401));

  const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
  const user = await User.findById(decoded.id);

  if (!user) return next(new ErrorHandler("User not found.", 404));

  req.user = user;
  next();
});

export const isAuthorized = (...roles) => {
  return (req, res, next) => {

    if (!req.user) return next(new ErrorHandler("User not authenticated.", 401));

    if (!roles.includes(req.user.role)) {
      return next(new ErrorHandler("Not allowed.", 403));
    }

    next();
  };
};
