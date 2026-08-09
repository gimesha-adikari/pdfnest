// PDFNEST_TEST_SOURCE_CODE
function calculateTotal(items: { price: number }[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

const cart = [{ price: 29.99 }, { price: 49.99 }];
console.log("Total:", calculateTotal(cart));
