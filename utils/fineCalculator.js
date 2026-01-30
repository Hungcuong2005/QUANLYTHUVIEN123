export const calculateFine = (dueDate) => {
  const finePerDay = 2000; // 2.000đ / ngày
  const today = new Date();

  if (today <= dueDate) return 0;

  const msPerDay = 24 * 60 * 60 * 1000;
  const lateDays = Math.ceil((today - dueDate) / msPerDay);

  return Math.min(lateDays * finePerDay, 50000); // trần 50k
};
