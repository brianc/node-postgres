### v1.0 - not released yet

- remove deprecated functionality
  - `pg.connect` now __requires__ 3 arguments
    - Client#pauseDrain() / Client#resumeDrain removed
      - numeric, decimal, and float data types no longer parsed into float before being returned. Will be returned from query results as `String`


### v0.14.0

- add deprecation warnings in prep for v1.0
- fix read/write failures in native module under node v0.9.x
