/** The plural rules of the language the interface is written in. A translation changes both. */
const rules = new Intl.PluralRules('en')

/** One form per plural category the language uses, with `#` where the count goes. */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }

/** A counted phrase in the form the language's plural rules pick, such as "1 chat" or "3 chats". */
export const plural = (count: number, forms: PluralForms) =>
  (forms[rules.select(count)] ?? forms.other).replace('#', count.toLocaleString('en'))
