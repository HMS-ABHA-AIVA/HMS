let counter = 1000;

/** Makes an id for a demo record, like "bill-1004". */
export const newId = (prefix: string) => `${prefix}-${counter++}`;
