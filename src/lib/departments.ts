export const DEPARTMENTS = ['Grocery', 'Dairy', 'Meat', 'Produce'] as const
export type Department = typeof DEPARTMENTS[number]
