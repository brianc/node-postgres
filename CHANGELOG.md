## Change Log

### v2.11.1 (2014/01/22 14:43 +00:00)
- [#500](https://github.com/brianc/node-postgres/pull/500) comment explaining how to get oid for a type (@lalitkapoor)

- [#507](https://github.com/brianc/node-postgres/pull/507) Unexpected identifier with pg versions > 2.3.1 (@brianc)


### v2.11.0 (2014/01/06 14:11 +00:00)
- [#491](https://github.com/brianc/node-postgres/pull/491) Extended years (@hoegaarden)

- [#496](https://github.com/brianc/node-postgres/pull/496) Added note about node-postgres-pure (@benighted)

- [#497](https://github.com/brianc/node-postgres/pull/497) application_name (@hoegaarden)


### v2.10.0 (2013/12/27 22:22 +00:00)
- [#482](https://github.com/brianc/node-postgres/pull/482) Handle pgpass (@hoegaarden)


### v2.9.0 (2013/12/20 04:34 +00:00)
- [#487](https://github.com/brianc/node-postgres/pull/487) Set database on socket string connection (@aurium)


### v2.8.5 (2013/12/20 04:23 +00:00)
- [#486](https://github.com/brianc/node-postgres/pull/486) fix quoting for Windows compile (@rvagg)


### v2.8.4 (2013/12/13 00:28 +00:00)
- [#477](https://github.com/brianc/node-postgres/pull/477) use NAN for Node 0.8->0.11+ compatibility (@rvagg)

- [#480](https://github.com/brianc/node-postgres/pull/480) Fix for Y10k problem, see issue #441. (@benighted)


### v2.8.3 (2013/11/21 05:01 +00:00)
- [#470](https://github.com/brianc/node-postgres/pull/470) Use the correct environment variable for defaults on Windows (@Brar)


### v2.8.1 (2013/10/21 19:08 +00:00)
- [#457](https://github.com/brianc/node-postgres/pull/457) Clean up internals (@brianc)


### v2.8.0 (2013/10/18 17:19 +00:00)
- [#456](https://github.com/brianc/node-postgres/pull/456) Parse arrays: json[], uuid[] (@albert-lacki)


### v2.7.0 (2013/10/03 03:43 +00:00)
- [#439](https://github.com/brianc/node-postgres/pull/439) Update README to include new production use (@robraux)

- [#423](https://github.com/brianc/node-postgres/pull/423) Add support for single row mode (@rpedela)

- [#447](https://github.com/brianc/node-postgres/pull/447) Bind Buffer Variables as binary values (with Native implementation also) (@eugeneware)


### v2.6.2 (2013/09/11 15:46 +00:00)
- [#438](https://github.com/brianc/node-postgres/pull/438) fix global variable leaks for ROW_DESCRIPTION, FORMAT_TEXT, FORMAT_BINARY, DATA_ROW (@robraux)


### v2.6.0 (2013/09/05 22:04 +00:00)
- [#435](https://github.com/brianc/node-postgres/pull/435) improve SHELL portability (@shine-on)

- [#436](https://github.com/brianc/node-postgres/pull/436) Respect PGSSLMODE for setting SSL connection (@brianc)


### v2.5.1 (2013/09/02 03:09 +00:00)
- [#430](https://github.com/brianc/node-postgres/pull/430) Drop table if exists (@shine-on)

- [#432](https://github.com/brianc/node-postgres/pull/432) Fix for early dates (@brianc)


### v2.5.0 (2013/08/29 05:20 +00:00)
- [#426](https://github.com/brianc/node-postgres/pull/426) add zoomsquare to the list of production users (@reezer)

- [#427](https://github.com/brianc/node-postgres/pull/427) Add ability to opt-in to int8 parsing (@brianc)


### v2.4.0 (2013/08/23 03:32 +00:00)
- [#420](https://github.com/brianc/node-postgres/pull/420) Performance Improvements (@brianc)


### v2.3.1 (2013/08/01 14:32 +00:00)
- [#409](https://github.com/brianc/node-postgres/pull/409) Fix build when escape functions are not supported in libpq (@rpedela)


### v2.2.1 (2013/07/23 15:30 +00:00)
- [#402](https://github.com/brianc/node-postgres/pull/402) Adds Heap as a production user (@drob)

- [#407](https://github.com/brianc/node-postgres/pull/407) Use the standard postgres:// URL prefix for consistency (@deafbybeheading)


### v2.1.0 (2013/07/10 04:19 +00:00)
- [#381](https://github.com/brianc/node-postgres/pull/381) force usage of pg.native via environment variable (@hoegaarden)

- [#385](https://github.com/brianc/node-postgres/pull/385) Add default value for database host to lib/defaults.js  (@memosanchez)

- [#276](https://github.com/brianc/node-postgres/pull/276) Add ssl query string to the connection string parser #275 (@bryanburgers)

- [#388](https://github.com/brianc/node-postgres/pull/388) Issues/320 (@brianc)

- [#386](https://github.com/brianc/node-postgres/pull/386) Fix long-standing hanging SSL connection but with JavaScript (@brianc)

- [#387](https://github.com/brianc/node-postgres/pull/387) Ensure error being returned to native client (@brianc)

- [#393](https://github.com/brianc/node-postgres/pull/393) add support for result rows as arrays (@brianc)


### v2.0.0 (2013/06/19 02:44 +00:00)
- [#376](https://github.com/brianc/node-postgres/pull/376) Be more verbose about failures of incorrect copy usage test (@strk)

- [#353](https://github.com/brianc/node-postgres/pull/353) Handle bigint as string to prevent precision loss (@sevastos)


### v1.3.0 (2013/06/07 00:33 +00:00)
- [#370](https://github.com/brianc/node-postgres/pull/370) Makes client_encoding configurable and optional (@badave)


### v1.2.0 (2013/06/05 02:19 +00:00)
- [#359](https://github.com/brianc/node-postgres/pull/359) Add cartodb.com as production user (@strk)

- [#209](https://github.com/brianc/node-postgres/pull/209) Feature request: access field names and types even when NO rows are returned (@brianc)


### v1.1.3 (2013/06/03 16:46 +00:00)
- [#362](https://github.com/brianc/node-postgres/pull/362) Fix NEWS item about pg.connect callback.  (@strk)


### v1.1.2 (2013/05/23 15:24 +00:00)
- [#356](https://github.com/brianc/node-postgres/pull/356) Fix client_encoding setting to support pg_bouncer when using libpq (#270) (@Hebo)


### v1.1.1 (2013/05/20 22:22 +00:00)
- [#354](https://github.com/brianc/node-postgres/pull/354) Preserve an active domain on I/O in native bindings (@andreypopp)


### v1.1.0 (2013/04/22 15:49 +00:00)
- [#239](https://github.com/brianc/node-postgres/pull/239) Clarify node-pg's strategy for the JSON data type in Postgres (@brianc)


### v1.0.3 (2013/04/22 09:18 +00:00)
- [#334](https://github.com/brianc/node-postgres/pull/334) Check pg_config existance (@aleyush)

- [#238](https://github.com/brianc/node-postgres/pull/238) Store timezone-less dates in local time instead of UTC (@cdauth)


### v1.0.1 (2013/04/18 20:16 +00:00)
- [#322](https://github.com/brianc/node-postgres/pull/322) line 7 - var utils declared and not used on client.js (@KingKarl85)

- [#329](https://github.com/brianc/node-postgres/pull/329) Travis Nodejs 0.10 build error correction (@Pegase745)

- [#331](https://github.com/brianc/node-postgres/pull/331) fix tests on new versions of postgres (@brianc)


### v1.0 (2013/04/04 17:02 +00:00)
- [#315](https://github.com/brianc/node-postgres/pull/315) better handling of client stream termination (@brianc)

- [#316](https://github.com/brianc/node-postgres/pull/316) ignore socket hangup. fixes #314 (@brianc)

- [#301](https://github.com/brianc/node-postgres/pull/301) V1.0 (@brianc)


### v0.14.1 (2013/03/14 13:53 +00:00)
- [#307](https://github.com/brianc/node-postgres/pull/307) Loosen generic-pool dependency to ~2.0.2 (@strk)

- [#305](https://github.com/brianc/node-postgres/pull/305) Fix parsing of numeric[], previously returning array of ints (@strk)

- [#303](https://github.com/brianc/node-postgres/pull/303) Add a default "make all" rule to "build" the project (npm install) (@strk)


### v0.14.0 (2013/03/07 20:53 +00:00)
- [#298](https://github.com/brianc/node-postgres/pull/298) V0.14.0 pre (@brianc)


### v0.13.3 (2013/03/07 13:34 +00:00)
- [#281](https://github.com/brianc/node-postgres/pull/281) Fix Unix domain socket setting. (@adunstan)

- [#290](https://github.com/brianc/node-postgres/pull/290) fixed build broken under freebsd (@francoiscolas)

- [#292](https://github.com/brianc/node-postgres/pull/292) Cleanup (@brianc)

- [#291](https://github.com/brianc/node-postgres/pull/291) Potential fix for client_encoding error


### v0.13.1 (2013/02/22 17:48 +00:00)
- [#278](https://github.com/brianc/node-postgres/pull/278) Allow passing a JS array instead of an array literal where SQL expects an array (@adunstan)


### v0.13.0 (2013/02/22 02:45 +00:00)
- [#274](https://github.com/brianc/node-postgres/pull/274) Connection Pool refactor (@brianc)


### v0.12.1 (2013/01/25 02:51 +00:00)
- [#255](https://github.com/brianc/node-postgres/pull/255) add a NODE_MODULE() statement; fixes #222 (@booo)

- [#259](https://github.com/brianc/node-postgres/pull/259) here's the change and the test (@francoisp)

- [#256](https://github.com/brianc/node-postgres/pull/256) Introduce Jshint (@booo)


### v0.12.0 (2013/01/24 04:46 +00:00)
- [#252](https://github.com/brianc/node-postgres/pull/252) Connection parameters (@brianc)

- [#248](https://github.com/brianc/node-postgres/pull/248) Added varchar[] and char[] to array parsing. (@liamks)


### v0.11.3 (2013/01/21 01:57 +00:00)
- [#246](https://github.com/brianc/node-postgres/pull/246) Adding SaferAging as a production use of library (@voodootikigod)

- [#249](https://github.com/brianc/node-postgres/pull/249) fixing support for Unix sockets in native binding (rebased) (@booo)


### v0.11.2 (2013/01/16 16:51 +00:00)
- [#243](https://github.com/brianc/node-postgres/pull/243) Add prepare-test-db rule and advertise it (@strk)

- [#242](https://github.com/brianc/node-postgres/pull/242) Cleanly handle missing stream error on COPY operation. Closes #241 (@strk)


### v0.11.1 (2013/01/06 18:13 +00:00)
- [#235](https://github.com/brianc/node-postgres/pull/235) Add binding.gyp target for SunOS (@cdolan)


### v0.8.7 (2012/11/03 21:07 +00:00)
- [#197](https://github.com/brianc/node-postgres/pull/197) Update README.md (@andresgottlieb)

- [#196](https://github.com/brianc/node-postgres/pull/196) windows build (@booo)

- [#158](https://github.com/brianc/node-postgres/pull/158) Improve error message accuracy of native SendQuery (@kongelaks)

- [#213](https://github.com/brianc/node-postgres/pull/213) Use JS Date's getFullYear() in first example. (@gurjeet)

- [#215](https://github.com/brianc/node-postgres/pull/215) enable IPv6 support when using native bindings (@natesilva)


### v0.8.4 (2012/09/10 02:27 +00:00)
- [#174](https://github.com/brianc/node-postgres/pull/174) Fix typos in simple-query-tests.js (@grncdr)


### v0.8.3 (2012/08/21 02:42 +00:00)
- [#163](https://github.com/brianc/node-postgres/pull/163) Date type parser (@booo)

- [#172](https://github.com/brianc/node-postgres/pull/172) #161: Fixed bytea decode and added 'hex' for pg >= 9.0. (@linearray)


### v0.8.2 (2012/08/07 13:33 +00:00)
- [#151](https://github.com/brianc/node-postgres/pull/151) Expose a pass-through a logger for generic-pool and bump dependency version (@cosbynator)


### v0.8.1 (2012/07/12 03:50 +00:00)
- [#135](https://github.com/brianc/node-postgres/pull/135) failing test for issue 6247131 (@machunter)

- [#144](https://github.com/brianc/node-postgres/pull/144) Syntax highlighting for the README (@rpflorence)

- [#149](https://github.com/brianc/node-postgres/pull/149) additional changes for the native binding (@booo)


### v0.7.1 (2012/06/19 03:41 +00:00)
- [#134](https://github.com/brianc/node-postgres/pull/134) It said fork and add so that is what I did :) (@defunctzombie)


### v0.6.18 (2012/05/10 04:45 +00:00)
- [#114](https://github.com/brianc/node-postgres/pull/114) Fix indentation (@kennym)

- [#115](https://github.com/brianc/node-postgres/pull/115) Add `result` to row event (@chowey)

- [#126](https://github.com/brianc/node-postgres/pull/126) Use 'self.activeQuery' insead of 'this.activeQuery' in readyForQueue (@TauZero)


### v0.6.15 (2012/03/22 03:45 +00:00)
- [#103](https://github.com/brianc/node-postgres/pull/103) Handle "NULL" correctly in arrays (@jeremyevans)

- [#106](https://github.com/brianc/node-postgres/pull/106) Flush after sending data or commands (@PSUdaemon)


### v0.6.14 (2012/03/07 01:10 +00:00)
- [#101](https://github.com/brianc/node-postgres/pull/101) Native driver and database connectivity loss (@w1nk)


### v0.6.13 (2012/03/01 21:13 +00:00)
- [#96](https://github.com/brianc/node-postgres/pull/96) Add all numeric array data types (@chowey)


### v0.6.12 (2012/02/28 04:12 +00:00)
- [#100](https://github.com/brianc/node-postgres/pull/100) Enhanced array support (@jzimmek)


### v0.6.9 (2012/01/02 07:08 +00:00)
- [#77](https://github.com/brianc/node-postgres/pull/77) parseStringArray() bugfixes (@ahtih)

- [#79](https://github.com/brianc/node-postgres/pull/79) Use `(exit 0)` instead of `true` for windows install support.  (@chowey)


### v0.6.8 (2011/12/01 05:02 +00:00)
- [#20](https://github.com/brianc/node-postgres/pull/20) Would you like to pull my changes? (@AlexanderS)


### v0.6.6 (2011/11/11 06:18 +00:00)
- [#58](https://github.com/brianc/node-postgres/pull/58) stringArrayParser can parse empty arrays + stringArrayParser tests (@tokumine)

- [#71](https://github.com/brianc/node-postgres/pull/71) create-test-tables.js patch (@cstansbury)

- [#68](https://github.com/brianc/node-postgres/pull/68) request cancellation (@cricri)


### v0.6.3 (2011/10/24 16:29 +00:00)
- [#56](https://github.com/brianc/node-postgres/pull/56) Treat undefined values as NULL (@bdunavant)


### v0.5.8 (2011/10/04 04:45 +00:00)
- [#53](https://github.com/brianc/node-postgres/pull/53) All errors are now instances of the built in Error class (@homme)


### v0.5.5 (2011/08/16 23:59 +00:00)
- [#42](https://github.com/brianc/node-postgres/pull/42) added check for month in assert.UTCDate and fixed broken test (@neonstalwart)


### v0.5.2 (2011/07/19 23:13 +00:00)
- [#38](https://github.com/brianc/node-postgres/pull/38) Simple bytea support (@drdaeman)


### v0.4.1 (2011/05/01 22:26 +00:00)
- [#29](https://github.com/brianc/node-postgres/pull/29) Added parser for "interval" type (@ef4)


### v0.2.8 (2011/03/08 03:42 +00:00)
- [#19](https://github.com/brianc/node-postgres/pull/19) Found a bug. (@bjornblomqvist)


### v0.2.4 (2011/01/14 20:53 +00:00)
- [#8](https://github.com/brianc/node-postgres/pull/8) Found another bug related to time.. (@bjornblomqvist)


### v0.2.0 (2010/12/19 22:43 +00:00)
- [#6](https://github.com/brianc/node-postgres/pull/6) Here you go. (@JulianBirch)


### v0.1.1 (2010/12/14 02:01 +00:00)
- [#4](https://github.com/brianc/node-postgres/pull/4) Show stoper bug do to parseInt (@bjornblomqvist)

- [#5](https://github.com/brianc/node-postgres/pull/5) I forgot the add the test (@bjornblomqvist)


### v0.0.1 (2010/11/03 06:52 +00:00)
- [#1](https://github.com/brianc/node-postgres/pull/1) Tiny error propagation fix, no accompanying test :( (@pshc)
