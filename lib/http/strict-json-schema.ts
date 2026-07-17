import { z, type ZodRawShape, type output } from "zod";

const registeredSchemas = new WeakSet<object>();

export type StrictJsonSchema<Shape extends ZodRawShape> = Readonly<{
  safeParse(
    value: unknown,
  ): ReturnType<ReturnType<typeof z.strictObject<Shape>>["safeParse"]>;
}>;

export function strictJsonObject<Shape extends ZodRawShape>(
  shape: Shape,
): StrictJsonSchema<Shape> {
  const schema = z.strictObject(shape);
  const wrapper = Object.create(null) as StrictJsonSchema<Shape>;
  Object.defineProperty(wrapper, "safeParse", {
    configurable: false,
    enumerable: true,
    writable: false,
    value: (value: unknown) => schema.safeParse(value),
  });
  Object.freeze(wrapper);
  registeredSchemas.add(wrapper);
  return wrapper;
}

export type StrictJsonOutput<Schema> =
  Schema extends StrictJsonSchema<infer Shape>
    ? output<ReturnType<typeof z.strictObject<Shape>>>
    : never;

export function parseStrictJson<Shape extends ZodRawShape>(
  schema: StrictJsonSchema<Shape>,
  value: unknown,
) {
  const validWrapper =
    typeof schema === "object" &&
    schema !== null &&
    registeredSchemas.has(schema) &&
    Object.getPrototypeOf(schema) === null &&
    Object.isFrozen(schema) &&
    Object.getOwnPropertySymbols(schema).length === 0 &&
    Object.keys(schema).length === 1 &&
    Object.prototype.hasOwnProperty.call(schema, "safeParse");
  if (!validWrapper) throw new Error("Unregistered strict JSON schema");
  return schema.safeParse(value);
}
