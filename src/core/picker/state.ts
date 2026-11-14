import { fuzzyFilter } from '@earendil-works/pi-tui';

export interface Choice {
  id: string;
  search: string;
  section?: string;
  sectionNote?: string;
}

export class PickerState<C extends Choice> {
  query = '';
  selected = 0;
  private filtered: readonly C[];

  constructor(
    private all: readonly C[],
    start?: string,
  ) {
    this.filtered = all;
    const at = start === undefined ? -1 : all.findIndex((choice) => choice.id === start);
    this.selected = Math.max(0, at);
  }

  replace(all: readonly C[]): void {
    const keep = this.current?.id;
    this.all = all;
    this.filtered =
      this.query === '' ? all : fuzzyFilter([...all], this.query, (choice) => choice.search);
    const back = keep === undefined ? -1 : this.filtered.findIndex((choice) => choice.id === keep);
    this.selected = Math.max(
      0,
      Math.min(back < 0 ? this.selected : back, this.filtered.length - 1),
    );
  }
  get items(): readonly C[] {
    return this.filtered;
  }
  get current(): C | undefined {
    return this.filtered[this.selected];
  }

  search(query: string): void {
    const keep = this.current?.id;
    this.query = query;
    this.filtered =
      query === '' ? this.all : fuzzyFilter([...this.all], query, (choice) => choice.search);
    const back = keep === undefined ? -1 : this.filtered.findIndex((choice) => choice.id === keep);
    this.selected = query === '' ? Math.max(0, back) : 0;
  }
  type(text: string): void {
    this.search(this.query + text);
  }
  backspace(): void {
    this.search(Array.from(this.query).slice(0, -1).join(''));
  }

  move(by: number): void {
    const size = this.filtered.length;
    if (size === 0) return;
    this.selected = (((this.selected + by) % size) + size) % size;
  }
  jump(by: number): void {
    this.selected = Math.max(0, Math.min(this.filtered.length - 1, this.selected + by));
  }
  home(): void {
    this.selected = 0;
  }
  end(): void {
    this.selected = Math.max(0, this.filtered.length - 1);
  }
}
