class Deque {
  constructor() {
    this._store = Object.create(null)
    this._head = 0
    this._tail = 0
  }

  push(item) {
    this._store[this._tail++] = item
  }

  shift() {
    if (this._head === this._tail) return undefined
    const item = this._store[this._head]
    delete this._store[this._head++]
    return item
  }

  get length() {
    return this._tail - this._head
  }

  clear() {
    this._store = Object.create(null)
    this._head = 0
    this._tail = 0
  }

  remove(item) {
    const newStore = Object.create(null)
    const newHead = 0
    let newTail = 0
    for (let i = this._head; i < this._tail; i++) {
      const current = this._store[i]
      if (current !== item) {
        newStore[newTail++] = current
      }
    }
    this._store = newStore
    this._head = newHead
    this._tail = newTail
  }

  forEach(fn) {
    for (let i = this._head; i < this._tail; i++) {
      fn(this._store[i], i)
    }
  }
}

module.exports = Deque
