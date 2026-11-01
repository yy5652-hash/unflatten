export function mathSpeech(text: string) {
  return text
    .replace(/_{2,}/g, " blank ")
    .replace(/(\d+)\s*\/\s*(\d+)/g, "$1 over $2")
    .replace(/([\p{L}\d]+)(?:\^2|²)/gu, "$1 squared")
    .replace(/([\p{L}\d]+)(?:\^3|³)/gu, "$1 cubed")
    .replace(/([\p{L}\d]+)\^(\d+)/gu, "$1 to the power of $2")
    .replace(/×/g, " times ")
    .replace(/÷/g, " divided by ")
    .replace(/\s+/g, " ")
    .trim();
}
