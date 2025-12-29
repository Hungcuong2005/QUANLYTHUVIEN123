import { app } from "./app.js";


app.listen(process.env.PORT, () => {
    console.log(`Server chạy ở cổng ${process.env.PORT}`);
});