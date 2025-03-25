type CheckType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'function'
  | 'array'
  | 'null'
  | 'partial';

export function hasPropertyWithType(
  obj: object,
  prop: string,
  types: CheckType[]
): boolean {
  if (types.includes('partial') && !(prop in obj)) {
    return true;
  }
  if (!(prop in obj)) {
    return false;
  }
  const propValue: unknown = (obj as any)[prop];
  if (types.includes('null') && propValue === null) {
    return true;
  }
  if (types.includes('array') && Array.isArray(propValue)) {
    return true;
  }
  const type = typeof propValue;
  if ((types as string[]).includes(type)) {
    return true;
  }
  return false;
}
