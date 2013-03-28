### v1.0 - not released yet

- remove deprecated functionality
  - `pg.connect` now __requires__ 3 arguments
    - Client#pauseDrain() / Client#resumeDrain removed
      - numeric, decimal, and float data types no longer parsed into float before being returned. Will be returned from query results as `String`

### v0.15.0

- client now emits `end` when disconnected from back-end server
- if client is disconnected in the middle of a query, query receives an error

### v0.14.0

- add deprecation warnings in prep for v1.0
- fix read/write failures in native module under node v0.9.x
