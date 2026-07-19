import { z } from "zod";

export const macrosInputShape = {
  meal_description: z
    .string()
    .min(2)
    .max(2000)
    .describe(
      'Free-text meal description, e.g. "2 eggs, toast with butter, a banana and a glass of milk".',
    ),
};

export const MacrosInput = z.object(macrosInputShape);
export type MacrosInputType = z.infer<typeof MacrosInput>;
