export const calculateFine = (dueDate) => {
  const finePerDay = 2000;
  const graceHours = 2; // miễn 2 tiếng
  const today = new Date();
  const due = new Date(dueDate);

  const lateMs = today - due;
  if (lateMs <= 0) return 0;

  const graceMs = graceHours * 60 * 60 * 1000;
  if (lateMs <= graceMs) return 0;

  const msPerDay = 24 * 60 * 60 * 1000;
  const lateDays = Math.ceil((lateMs - graceMs) / msPerDay);

  return Math.min(lateDays * finePerDay, 50000);
};
