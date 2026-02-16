let counter = 0;

export function v4(): string {
  counter++;
  return `mock-uuid-${counter}-${Date.now()}`;
}

export function resetCounter(): void {
  counter = 0;
}
