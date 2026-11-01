declare module "hypher" {
  export default class Hypher {
    constructor(pattern: unknown);
    hyphenate(word: string): string[];
  }
}
