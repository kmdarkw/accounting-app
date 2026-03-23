const currencyFormatter = new Intl.NumberFormat("ar-KW-u-nu-latn", {
  style: "currency",
  currency: "KWD",
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

const dateFormatter = new Intl.DateTimeFormat("ar-KW-u-nu-latn-ca-gregory", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatCurrencyKwd(value: number) {
  return currencyFormatter.format(value);
}

export function formatGregorianDate(value: string | number | Date) {
  return dateFormatter.format(new Date(value));
}
