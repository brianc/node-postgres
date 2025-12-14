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
    this._store[this._head] = undefined
    this._head++

    if (this._head === this._tail) {
      this._head = 0
      this._tail = 0
    }

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
    if (this._head === this._tail) return

    const store = this._store
    let write = this._head

    for (let read = this._head; read < this._tail; read++) {
      const current = store[read]
      if (current !== item) {
        store[write++] = current
      }
    }

    for (let i = write; i < this._tail; i++) {
      store[i] = undefined
    }

    this._tail = write

    if (this._head === this._tail) {
      this._head = 0
      this._tail = 0
    }
  }

  forEach(fn) {
    for (let i = this._head; i < this._tail; i++) {
      fn(this._store[i])
    }
  }
}

module.exports = Deque
