// 将b对象的属性拷贝到a对象
export function extend (a, b) {
  for (const key in b) {
    a[key] = b[key]
  }
  return a
}
