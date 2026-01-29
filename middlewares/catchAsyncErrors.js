// middlewares/catchAsyncErrors.js
export const catchAsyncErrors = (theFunction) => {
  return (req, res, next) => {
    
     const safeNext =
      typeof next === "function"
        ? next
        : (error) => {
            throw error;
          };

    Promise.resolve(theFunction(req, res, safeNext)).catch(safeNext);
  };
};
