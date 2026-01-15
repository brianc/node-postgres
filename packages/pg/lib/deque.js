class Deque {
  constructor() {
    this._head = null
    this._tail = null
    this._size = 0
    this._index = new WeakMap()
  }

  push(item) {
    const node = { value: item, prev: this._tail, next: null }

    if (this._tail) {
      node.prev = this._tail
      this._tail.next = node
      this._tail = node
    } else {
      this._head = this._tail = node
    }

    this._index.set(item, node)
    this._size++
  }

  shift() {
    if (!this._head) return undefined

    const node = this._head
    const value = node.value

    this._head = node.next
    if (this._head) {
      this._head.prev = null
    } else {
      this._tail = null
    }

    this._index.delete(value)
    this._size--

    node.prev = node.next = null

    return value
  }

  get length() {
    return this._size
  }

  clear() {
    this._head = null
    this._tail = null
    this._size = 0
    this._index = new WeakMap()
  }

  remove(item) {
    const node = this._index.get(item)
    if (!node) return false

    if (node.prev) node.prev.next = node.next
    else this._head = node.next

    if (node.next) node.next.prev = node.prev
    else this._tail = node.prev

    this._index.delete(item)
    this._size--

    node.prev = node.next = null

    return true
  }

  forEach(fn) {
    let curr = this._head
    while (curr) {
      fn(curr.value)
      curr = curr.next
    }
  }
}

module.exports = Deque
