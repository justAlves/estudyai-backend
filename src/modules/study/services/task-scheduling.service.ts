type ScheduledTask = { id: string; scheduledFor: string; estimatedMinutes: number; status: string };

const date = (value: string) => new Date(`${value}T12:00:00Z`);
const format = (value: Date) => value.toISOString().slice(0, 10);

export function nextAvailableStudyDay(tasks: ScheduledTask[], task: ScheduledTask, dailyMinutes: number, today = new Date()) {
  if (task.estimatedMinutes > dailyMinutes) throw new Error("A tarefa excede a meta diária.");

  const start = date(task.scheduledFor) > date(format(today)) ? date(task.scheduledFor) : date(format(today));
  start.setUTCDate(start.getUTCDate() + 1);
  const occupied = tasks.filter((item) => item.id !== task.id && item.status === "PENDING");

  while (true) {
    if (start.getUTCDay() !== 0 && start.getUTCDay() !== 6) {
      const minutes = occupied.filter((item) => item.scheduledFor === format(start)).reduce((sum, item) => sum + item.estimatedMinutes, 0);
      if (minutes + task.estimatedMinutes <= dailyMinutes) return format(start);
    }
    start.setUTCDate(start.getUTCDate() + 1);
  }
}
