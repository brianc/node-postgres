#include <pg_config.h>
#include <libpq-fe.h>
#include <nan.h>
#include <string.h>
#include <assert.h>
#include <stdlib.h>

#define LOG(msg) printf("%s\n",msg);
#define TRACE(msg) //printf("%s\n", msg);

#if PG_VERSION_NUM >= 90000
#define ESCAPE_SUPPORTED
#endif

#if PG_VERSION_NUM >= 90200
#define SINGLE_ROW_SUPPORTED
#endif

#define THROW(msg) NanThrowError(msg); NanReturnUndefined();

using namespace v8;
using namespace node;

class Connection : public ObjectWrap {

public:

  //creates the V8 objects & attaches them to the module (target)
  static void
  Init (Handle<Object> target)
  {
    NanScope();
    Local<FunctionTemplate> t = NanNew<FunctionTemplate>(New);

    t->InstanceTemplate()->SetInternalFieldCount(1);
    t->SetClassName(NanNew("Connection"));

    NanSetPrototypeTemplate(t, "connect", NanNew<FunctionTemplate>(Connect));
#ifdef ESCAPE_SUPPORTED
    NanSetPrototypeTemplate(t, "escapeIdentifier", NanNew<FunctionTemplate>(EscapeIdentifier));
    NanSetPrototypeTemplate(t, "escapeLiteral", NanNew<FunctionTemplate>(EscapeLiteral));
#endif
    NanSetPrototypeTemplate(t, "_sendQuery", NanNew<FunctionTemplate>(SendQuery));
    NanSetPrototypeTemplate(t, "_sendQueryWithParams", NanNew<FunctionTemplate>(SendQueryWithParams));
    NanSetPrototypeTemplate(t, "_sendPrepare", NanNew<FunctionTemplate>(SendPrepare));
    NanSetPrototypeTemplate(t, "_sendQueryPrepared", NanNew<FunctionTemplate>(SendQueryPrepared));
    NanSetPrototypeTemplate(t, "cancel", NanNew<FunctionTemplate>(Cancel));
    NanSetPrototypeTemplate(t, "end", NanNew<FunctionTemplate>(End));
    NanSetPrototypeTemplate(t, "_sendCopyFromChunk", NanNew<FunctionTemplate>(SendCopyFromChunk));
    NanSetPrototypeTemplate(t, "_endCopyFrom", NanNew<FunctionTemplate>(EndCopyFrom));
    target->Set(NanNew("Connection"), t->GetFunction());
    TRACE("created class");
  }

  //static function called by libuv as callback entrypoint
  static void
  io_event(uv_poll_t* w, int status, int revents)
  {

    TRACE("Received IO event");

    if(status == -1) {
      TRACE("Connection error. -1 status from lib_uv_poll");
    }

    Connection *connection = static_cast<Connection*>(w->data);
    connection->HandleIOEvent(revents);
  }

  //v8 entry point into Connection#connect
  static NAN_METHOD(Connect)
  {
    NanScope();
    Connection *self = ObjectWrap::Unwrap<Connection>(args.This());
    if(args.Length() == 0 || !args[0]->IsString()) {
      THROW("Must include connection string as only argument to connect");
    }

    String::Utf8Value conninfo(args[0]->ToString());
    bool success = self->Connect(*conninfo);
    if(!success) {
      self -> EmitLastError();
      self -> DestroyConnection();
    }

    NanReturnUndefined();
  }

  //v8 entry point into Connection#cancel
  static NAN_METHOD(Cancel)
  {
    NanScope();
    Connection *self = ObjectWrap::Unwrap<Connection>(args.This());

    bool success = self->Cancel();
    if(!success) {
      self -> EmitLastError();
      self -> DestroyConnection();
    }

    NanReturnUndefined();
  }

#ifdef ESCAPE_SUPPORTED
  //v8 entry point into Connection#escapeIdentifier
  static NAN_METHOD(EscapeIdentifier)
  {
    NanScope();
    Connection *self = ObjectWrap::Unwrap<Connection>(args.This());

    char* inputStr = MallocCString(args[0]);

    if(!inputStr) {
      THROW("Unable to allocate memory for a string in EscapeIdentifier.")
    }

    char* escapedStr = self->EscapeIdentifier(inputStr);
    free(inputStr);

    if(escapedStr == NULL) {
      THROW(self->GetLastError());
    }

    Local<Value> jsStr = NanNew<String>(escapedStr, strlen(escapedStr));
    PQfreemem(escapedStr);

    NanReturnValue(jsStr);
  }

  //v8 entry point into Connection#escapeLiteral
  static NAN_METHOD(EscapeLiteral)
  {
    NanScope();
    Connection *self = ObjectWrap::Unwrap<Connection>(args.This());

    char* inputStr = MallocCString(args[0]);

    if(!inputStr) {
      THROW("Unable to allocate memory for a string in EscapeIdentifier.")
    }

    char* escapedStr = self->EscapeLiteral(inputStr);
    free(inputStr);

    if(escapedStr == NULL) {
      THROW(self->GetLastError());
    }

    Local<Value> jsStr = NanNew<String>(escapedStr, strlen(escapedStr));
    PQfreemem(escapedStr);

    NanReturnValue(jsStr);
  }
#endif

  //v8 entry point into Connection#_sendQuery
  static NAN_METHOD(SendQuery)
  {
    NanScope();
    Connection *self = ObjectWrap::Unwrap<Connection>(args.This());
    const char *lastErrorMessage;
    if(!args[0]->IsString()) {
      THROW("First parameter must be a string query");
    }

    char* queryText = MallocCString(args[0]);
    bool singleRowMode = (bool)args[1]->Int32Value();

    int result = self->Send(queryText, singleRowMode);
    free(queryText);
    if(result == 0) {
      lastErrorMessage = self->GetLastError();
      THROW(lastErrorMessage);
    }
    //TODO should we flush before throw?
    self->Flush();
    NanReturnUndefined();
  }

  //v8 entry point into Connection#_sendQueryWithParams
  static NAN_METHOD(SendQueryWithParams)
  {
    NanScope();
    //dispatch non-prepared parameterized query
    DispatchParameterizedQuery(args, false);
    NanReturnUndefined();
  }

  //v8 entry point into Connection#_sendPrepare(string queryName, string queryText, int nParams)
  static NAN_METHOD(SendPrepare)
  {
    NanScope();

    Connection *self = ObjectWrap::Unwrap<Connection>(args.This());
    String::Utf8Value queryName(args[0]);
    String::Utf8Value queryText(args[1]);
    int length = args[2]->Int32Value();
    bool singleRowMode = (bool)args[3]->Int32Value();
    self->SendPrepare(*queryName, *queryText, length, singleRowMode);

    NanReturnUndefined();
  }

  //v8 entry point into Connection#_sendQueryPrepared(string queryName, string[] paramValues)
  static NAN_METHOD(SendQueryPrepared)
  {
    NanScope();
    //dispatch prepared parameterized query
    DispatchParameterizedQuery(args, true);
    NanReturnUndefined();
  }

  static void DispatchParameterizedQuery(_NAN_METHOD_ARGS, bool isPrepared)
  {
    NanScope();
    Connection *self = ObjectWrap::Unwrap<Connection>(args.This());

    String::Utf8Value queryName(args[0]);
    //TODO this is much copy/pasta code
    if(!args[0]->IsString()) {
      NanThrowError("First parameter must be a string");
      return;
    }

    if(!args[1]->IsArray()) {
      NanThrowError("Values must be an array");
      return;
    }

    Local<Array> jsParams = Local<Array>::Cast(args[1]);
    int len = jsParams->Length();


    char** paramValues = ArgToCStringArray(jsParams);
    if(!paramValues) {
      NanThrowError("Unable to allocate char **paramValues from Local<Array> of v8 params");
      return;
    }

    char* queryText = MallocCString(args[0]);
    bool singleRowMode = (bool)args[2]->Int32Value();

    int result = 0;
    if(isPrepared) {
      result = self->SendPreparedQuery(queryText, len, paramValues, singleRowMode);
    } else {
      result = self->SendQueryParams(queryText, len, paramValues, singleRowMode);
    }

    free(queryText);
    ReleaseCStringArray(paramValues, len);
    if(result == 1) {
      return;
    }
    self->EmitLastError();
    NanThrowError("Postgres returned non-1 result from query dispatch.");
  }

  //v8 entry point into Connection#end
  static NAN_METHOD(End)
  {
    NanScope();

    Connection *self = ObjectWrap::Unwrap<Connection>(args.This());

    self->End();
    NanReturnUndefined();
  }

  uv_poll_t read_watcher_;
  uv_poll_t  write_watcher_;
  PGconn *connection_;
  bool connecting_;
  bool ioInitialized_;
  bool copyOutMode_;
  bool copyInMode_;
  bool reading_;
  bool writing_;
  bool ended_;
  Connection () : ObjectWrap ()
  {
    connection_ = NULL;
    connecting_ = false;
    ioInitialized_ = false;
    copyOutMode_ = false;
    copyInMode_ = false;
    reading_ = false;
    writing_ = false;
    ended_ = false;
    TRACE("Initializing ev watchers");
    read_watcher_.data = this;
    write_watcher_.data = this;
  }

  ~Connection ()
  {
  }

  static NAN_METHOD(SendCopyFromChunk) {
    NanScope();
    Connection *self = ObjectWrap::Unwrap<Connection>(args.This());
    //TODO handle errors in some way
    if (args.Length() < 1 && !Buffer::HasInstance(args[0])) {
      THROW("SendCopyFromChunk requires 1 Buffer argument");
    }
    self->SendCopyFromChunk(args[0]->ToObject());
    NanReturnUndefined();
  }
  static NAN_METHOD(EndCopyFrom) {
    NanScope();
    Connection *self = ObjectWrap::Unwrap<Connection>(args.This());
    char * error_msg = NULL;
    if (args[0]->IsString()) {
      error_msg = MallocCString(args[0]);
    }
    //TODO handle errors in some way
    self->EndCopyFrom(error_msg);
    free(error_msg);
    NanReturnUndefined();
  }

protected:
  //v8 entry point to constructor
  static NAN_METHOD(New)
  {
    NanScope();
    Connection *connection = new Connection();
    connection->Wrap(args.This());

    NanReturnValue(args.This());
  }

#ifdef ESCAPE_SUPPORTED
  char * EscapeIdentifier(const char *str)
  {
    TRACE("js::EscapeIdentifier")
    return PQescapeIdentifier(connection_, str, strlen(str));
  }

  char * EscapeLiteral(const char *str)
  {
    TRACE("js::EscapeLiteral")
    return PQescapeLiteral(connection_, str, strlen(str));
  }
#endif

  void enableSingleRowMode(bool enable)
  {
#ifdef SINGLE_ROW_SUPPORTED
    if(enable == true) {
        int mode = PQsetSingleRowMode(connection_);
        if(mode == 1) {
            TRACE("PQsetSingleRowMode enabled")
        } else {
            TRACE("PQsetSingleRowMode disabled")
        }
    } else {
        TRACE("PQsetSingleRowMode disabled")
    }
#endif
  }

  int Send(const char *queryText, bool singleRowMode)
  {
    TRACE("js::Send")
    int rv = PQsendQuery(connection_, queryText);
    enableSingleRowMode(singleRowMode);
    StartWrite();
    return rv;
  }

  int SendQueryParams(const char *command, const int nParams, const char * const *paramValues, bool singleRowMode)
  {
    TRACE("js::SendQueryParams")
    int rv = PQsendQueryParams(connection_, command, nParams, NULL, paramValues, NULL, NULL, 0);
    enableSingleRowMode(singleRowMode);
    StartWrite();
    return rv;
  }

  int SendPrepare(const char *name, const char *command, const int nParams, bool singleRowMode)
  {
    TRACE("js::SendPrepare")
    int rv = PQsendPrepare(connection_, name, command, nParams, NULL);
    enableSingleRowMode(singleRowMode);
    StartWrite();
    return rv;
  }

  int SendPreparedQuery(const char *name, int nParams, const char * const *paramValues, bool singleRowMode)
  {
    int rv = PQsendQueryPrepared(connection_, name, nParams, paramValues, NULL, NULL, 0);
    enableSingleRowMode(singleRowMode);
    StartWrite();
    return rv;
  }

  bool Cancel()
  {
    PGcancel* pgCancel = PQgetCancel(connection_);
    char errbuf[256];
    int result = PQcancel(pgCancel, errbuf, 256);
    StartWrite();
    PQfreeCancel(pgCancel);
    return result;
  }

  //flushes socket
  void Flush()
  {
    if(PQflush(connection_) == 1) {
      TRACE("Flushing");
      uv_poll_start(&write_watcher_, UV_WRITABLE, io_event);
    }
  }

  //safely destroys the connection at most 1 time
  void DestroyConnection()
  {
    if(connection_ != NULL) {
      PQfinish(connection_);
      connection_ = NULL;
    }
  }

  //initializes initial async connection to postgres via libpq
  //and hands off control to libev
  bool Connect(const char* conninfo)
  {
    if(ended_) return true;
    connection_ = PQconnectStart(conninfo);

    if (!connection_) {
      LOG("Connection couldn't be created");
    }

    ConnStatusType status = PQstatus(connection_);

    if(CONNECTION_BAD == status) {
      return false;
    }

    if (PQsetnonblocking(connection_, 1) == -1) {
      LOG("Unable to set connection to non-blocking");
      return false;
    }

    int fd = PQsocket(connection_);
    if(fd < 0) {
      LOG("socket fd was negative. error");
      return false;
    }

    assert(PQisnonblocking(connection_));

    PQsetNoticeProcessor(connection_, NoticeReceiver, this);

    TRACE("Setting watchers to socket");
    uv_poll_init(uv_default_loop(), &read_watcher_, fd);
    uv_poll_init(uv_default_loop(), &write_watcher_, fd);

    ioInitialized_ = true;

    connecting_ = true;
    StartWrite();

    Ref();
    return true;
  }

  static void NoticeReceiver(void *arg, const char *message)
  {
    Connection *self = (Connection*)arg;
    self->HandleNotice(message);
  }

  void HandleNotice(const char *message)
  {
    NanScope();
    Handle<Value> notice = NanNew<String>(message);
    Emit("notice", &notice);
  }

  //called to process io_events from libuv
  void HandleIOEvent(int revents)
  {

    if(connecting_) {
      TRACE("Processing connecting_ io");
      HandleConnectionIO();
      return;
    }

    if(revents & UV_READABLE) {
      TRACE("revents & UV_READABLE");
      TRACE("about to consume input");
      if(PQconsumeInput(connection_) == 0) {
        TRACE("could not read, terminating");
        End();
        EmitLastError();
        //LOG("Something happened, consume input is 0");
        return;
      }
      TRACE("Consumed");

      //declare handlescope as this method is entered via a libuv callback
      //and not part of the public v8 interface
      NanScope();
      if (this->copyOutMode_) {
        this->HandleCopyOut();
      }
      if (!this->copyInMode_ && !this->copyOutMode_ && PQisBusy(connection_) == 0) {
        PGresult *result;
        bool didHandleResult = false;
        TRACE("PQgetResult");
        while ((result = PQgetResult(connection_))) {
          TRACE("HandleResult");
          didHandleResult = HandleResult(result);
          TRACE("PQClear");
          PQclear(result);
          if(!didHandleResult) {
            //this means that we are in copy in or copy out mode
            //in this situation PQgetResult will return same
            //result untill all data will be read (copy out) or
            //until data end notification (copy in)
            //and because of this, we need to break cycle
            break;
          }
        }
        //might have fired from notification
        if(didHandleResult) {
          Emit("_readyForQuery");
        }
      }

      PGnotify *notify;
      TRACE("PQnotifies");
      while ((notify = PQnotifies(connection_))) {
        Local<Object> result = NanNew<Object>();
        result->Set(NanNew("channel"), NanNew(notify->relname));
        result->Set(NanNew("payload"), NanNew(notify->extra));
        Handle<Value> res = (Handle<Value>)result;
        Emit("notification", &res);
        PQfreemem(notify);
      }

    }

    if(revents & UV_WRITABLE) {
      TRACE("revents & UV_WRITABLE");
      if (PQflush(connection_) == 0) {
        //nothing left to write, poll the socket for more to read
        StartRead();
      }
    }
  }
  bool HandleCopyOut () {
    char * buffer = NULL;
    int copied;
    copied = PQgetCopyData(connection_, &buffer, 1);
    while (copied > 0) { 
      Local<Value> node_chunk = NanNewBufferHandle(buffer, copied); 
      Emit("copyData", &node_chunk);
      PQfreemem(buffer);
      copied = PQgetCopyData(connection_, &buffer, 1);
    }
    if (copied == 0) {
      //wait for next read ready
      //result was not handled completely
      return false;
    } else if (copied == -1) {
      this->copyOutMode_ = false;
      return true;
    } else if (copied == -2) {
      this->copyOutMode_ = false;
      return true;
    }
    return false;
  }

  //maps the postgres tuple results to v8 objects
  //and emits row events
  //TODO look at emitting fewer events because the back & forth between
  //javascript & c++ might introduce overhead (requires benchmarking)
  void EmitRowDescription(const PGresult* result)
  {
    NanScope();
    Local<Array> row = NanNew<Array>();
    int fieldCount = PQnfields(result);
    for(int fieldNumber = 0; fieldNumber < fieldCount; fieldNumber++) {
      Local<Object> field = NanNew<Object>();
      //name of field
      char* fieldName = PQfname(result, fieldNumber);
      field->Set(NanNew("name"), NanNew(fieldName));

      //oid of type of field
      int fieldType = PQftype(result, fieldNumber);
      field->Set(NanNew("dataTypeID"), NanNew(fieldType));

      row->Set(NanNew(fieldNumber), field);
    }

    Handle<Value> e = (Handle<Value>)row;
    Emit("_rowDescription", &e);
  }

  bool HandleResult(PGresult* result)
  {
    TRACE("PQresultStatus");
    ExecStatusType status = PQresultStatus(result);
    switch(status) {
    case PGRES_TUPLES_OK:
#ifdef SINGLE_ROW_SUPPORTED
    case PGRES_SINGLE_TUPLE:
#endif
      {
        EmitRowDescription(result);
        HandleTuplesResult(result);
        EmitCommandMetaData(result);
        return true;
      }
      break;
    case PGRES_FATAL_ERROR:
      {
        TRACE("HandleErrorResult");
        HandleErrorResult(result);
        return true;
      }
      break;
    case PGRES_COMMAND_OK:
    case PGRES_EMPTY_QUERY:
      {
        EmitCommandMetaData(result);
        return true;
      }
      break;
    case PGRES_COPY_IN: 
      {
        this->copyInMode_ = true;
        Emit("copyInResponse");
        return false;
      }
      break;
    case PGRES_COPY_OUT:
      {
        this->copyOutMode_ = true;
        Emit("copyOutResponse");
        return this->HandleCopyOut();
      }
      break;
    default:
      printf("YOU SHOULD NEVER SEE THIS! PLEASE OPEN AN ISSUE ON GITHUB! Unrecogized query status: %s\n", PQresStatus(status));
      break;
    }
    return true;
  }

  void EmitCommandMetaData(PGresult* result)
  {
    NanScope();
    Local<Object> info = NanNew<Object>();
    info->Set(NanNew("command"), NanNew(PQcmdStatus(result)));
    info->Set(NanNew("value"), NanNew(PQcmdTuples(result)));
    Handle<Value> e = (Handle<Value>)info;
    Emit("_cmdStatus", &e);
  }

  //maps the postgres tuple results to v8 objects
  //and emits row events
  //TODO look at emitting fewer events because the back & forth between
  //javascript & c++ might introduce overhead (requires benchmarking)
  void HandleTuplesResult(const PGresult* result)
  {
    NanScope();
    int rowCount = PQntuples(result);
    for(int rowNumber = 0; rowNumber < rowCount; rowNumber++) {
      //create result object for this row
      Local<Array> row = NanNew<Array>();
      int fieldCount = PQnfields(result);
      for(int fieldNumber = 0; fieldNumber < fieldCount; fieldNumber++) {

        //value of field
        if(PQgetisnull(result, rowNumber, fieldNumber)) {
          row->Set(NanNew(fieldNumber), NanNull());
        } else {
          char* fieldValue = PQgetvalue(result, rowNumber, fieldNumber);
          row->Set(NanNew(fieldNumber), NanNew(fieldValue));
        }
      }

      Handle<Value> e = (Handle<Value>)row;
      Emit("_row", &e);
    }
  }

  void HandleErrorResult(const PGresult* result)
  {
    NanScope();
    //instantiate the return object as an Error with the summary Postgres message
    TRACE("ReadResultField");
    const char* errorMessage = PQresultErrorField(result, PG_DIAG_MESSAGE_PRIMARY);
    if(!errorMessage) {
      //there is no error, it has already been consumed in the last
      //read-loop callback
      return;
    }
    Local<Object> msg = Local<Object>::Cast(NanError(errorMessage));
    TRACE("AttachErrorFields");
    //add the other information returned by Postgres to the error object
    AttachErrorField(result, msg, NanNew("severity"), PG_DIAG_SEVERITY);
    AttachErrorField(result, msg, NanNew("code"), PG_DIAG_SQLSTATE);
    AttachErrorField(result, msg, NanNew("detail"), PG_DIAG_MESSAGE_DETAIL);
    AttachErrorField(result, msg, NanNew("hint"), PG_DIAG_MESSAGE_HINT);
    AttachErrorField(result, msg, NanNew("position"), PG_DIAG_STATEMENT_POSITION);
    AttachErrorField(result, msg, NanNew("internalPosition"), PG_DIAG_INTERNAL_POSITION);
    AttachErrorField(result, msg, NanNew("internalQuery"), PG_DIAG_INTERNAL_QUERY);
    AttachErrorField(result, msg, NanNew("where"), PG_DIAG_CONTEXT);
    AttachErrorField(result, msg, NanNew("file"), PG_DIAG_SOURCE_FILE);
    AttachErrorField(result, msg, NanNew("line"), PG_DIAG_SOURCE_LINE);
    AttachErrorField(result, msg, NanNew("routine"), PG_DIAG_SOURCE_FUNCTION);
    Handle<Value> m = msg;
    TRACE("EmitError");
    Emit("_error", &m);
  }

  void AttachErrorField(const PGresult *result, const Local<Object> msg, const Local<String> symbol, int fieldcode)
  {
    NanScope();
    char *val = PQresultErrorField(result, fieldcode);
    if(val) {
      msg->Set(symbol, NanNew(val));
    }
  }

  void End()
  {
    TRACE("stopping read & write");
    StopRead();
    StopWrite();
    DestroyConnection();
    Emit("_end");
    ended_ = true;
  }

private:
  //EventEmitter was removed from c++ in node v0.5.x
  void Emit(const char* message) {
    NanScope();
    Handle<Value> args[1] = { NanNew(message) };
    Emit(1, args);
  }

  void Emit(const char* message, Handle<Value>* arg) {
    NanScope();
    Handle<Value> args[2] = { NanNew(message), *arg };
    Emit(2, args);
  }

  void Emit(int length, Handle<Value> *args) {
    NanScope();

    Local<Value> emit_v = NanObjectWrapHandle(this)->Get(NanNew("emit"));
    assert(emit_v->IsFunction());
    Local<Function> emit_f = emit_v.As<Function>();

    TryCatch tc;
    emit_f->Call(NanObjectWrapHandle(this), length, args);
    if(tc.HasCaught()) {
      FatalException(tc);
    }
  }

  void HandleConnectionIO()
  {
    PostgresPollingStatusType status = PQconnectPoll(connection_);
    switch(status) {
      case PGRES_POLLING_READING:
        TRACE("Polled: PGRES_POLLING_READING");
        StartRead();
        break;
      case PGRES_POLLING_WRITING:
        TRACE("Polled: PGRES_POLLING_WRITING");
        StartWrite();
        break;
      case PGRES_POLLING_FAILED:
        StopRead();
        StopWrite();
        TRACE("Polled: PGRES_POLLING_FAILED");
        EmitLastError();
        break;
      case PGRES_POLLING_OK:
        TRACE("Polled: PGRES_POLLING_OK");
        connecting_ = false;
        StartRead();
        Emit("connect");
      default:
        //printf("Unknown polling status: %d\n", status);
        break;
    }
  }

  void EmitError(const char *message)
  {
    NanScope();
    Local<Value> exception = NanError(message);
    Emit("_error", &exception);
  }

  void EmitLastError()
  {
    EmitError(PQerrorMessage(connection_));
  }

  const char *GetLastError()
  {
    return PQerrorMessage(connection_);
  }

  void StopWrite()
  {
    TRACE("write STOP");
    if(ioInitialized_ && writing_) {
      uv_poll_stop(&write_watcher_);
      writing_ = false;
    }
  }

  void StartWrite()
  {
    TRACE("write START");
    if(reading_) {
      TRACE("stop READ to start WRITE");
      StopRead();
    }
    uv_poll_start(&write_watcher_, UV_WRITABLE, io_event);
    writing_ = true;
  }

  void StopRead()
  {
    TRACE("read STOP");
    if(ioInitialized_ && reading_) {
      uv_poll_stop(&read_watcher_);
      reading_ = false;
    }
  }

  void StartRead()
  {
    TRACE("read START");
    if(writing_) {
      TRACE("stop WRITE to start READ");
      StopWrite();
    }
    uv_poll_start(&read_watcher_, UV_READABLE, io_event);
    reading_ = true;
  }
  //Converts a v8 array to an array of cstrings
  //the result char** array must be free() when it is no longer needed
  //if for any reason the array cannot be created, returns 0
  static char** ArgToCStringArray(Local<Array> params)
  {
    int len = params->Length();
    char** paramValues = new char*[len];
    for(int i = 0; i < len; i++) {
      Handle<Value> val = params->Get(i);
      if(val->IsString()) {
        char* cString = MallocCString(val);
        //will be 0 if could not malloc
        if(!cString) {
          LOG("ArgToCStringArray: OUT OF MEMORY OR SOMETHING BAD!");
          ReleaseCStringArray(paramValues, i-1);
          return 0;
        }
        paramValues[i] = cString;
      } else if(val->IsNull()) {
        paramValues[i] = NULL;
      } else if(val->IsObject() && Buffer::HasInstance(val)) {
        if(Buffer::Length(val) > 0) {
          char *cHexString = MallocCHexString(val->ToObject());
          if(!cHexString) {
            LOG("ArgToCStringArray: OUT OF MEMORY OR SOMETHING BAD!");
            ReleaseCStringArray(paramValues, i-1);
            return 0;
          }
          paramValues[i] = cHexString;
        } else {
          paramValues[i] = MallocCString(NanNew<String>(""));
        }
      } else {
        //a paramter was not a string
        LOG("Parameter not a string or buffer");
        ReleaseCStringArray(paramValues, i-1);
        return 0;
      }
    }
    return paramValues;
  }

  //helper function to release cString arrays
  static void ReleaseCStringArray(char **strArray, int len)
  {
    for(int i = 0; i < len; i++) {
      free(strArray[i]);
    }
    delete [] strArray;
  }

  //helper function to malloc new string from v8string
  static char* MallocCString(v8::Handle<Value> v8String)
  {
    String::Utf8Value utf8String(v8String->ToString());
    char *cString = (char *) malloc(strlen(*utf8String) + 1);
    if(!cString) {
      return cString;
    }
    strcpy(cString, *utf8String);
    return cString;
  }

  //helper function to Malloc a Bytea encoded Hex string from a buffer
  static char* MallocCHexString(v8::Handle<Object> buf)
  {
    char* bufferData = Buffer::Data(buf);
    size_t hexStringLen = Buffer::Length(buf)*2 + 3;
    char *cHexString = (char *) malloc(hexStringLen);
    if(!cHexString) {
      return cHexString;
    }
    strcpy(cHexString, "\\x");
    for (uint32_t i = 0, k = 2; k < hexStringLen; i += 1, k += 2) {
      static const char hex[] = "0123456789abcdef";
      uint8_t val = static_cast<uint8_t>(bufferData[i]);
      cHexString[k + 0] = hex[val >> 4];
      cHexString[k + 1] = hex[val & 15];
    }
    cHexString[hexStringLen-1] = 0;
    return cHexString;
  }

  void SendCopyFromChunk(Handle<Object> chunk) {
    PQputCopyData(connection_, Buffer::Data(chunk), Buffer::Length(chunk));
  }
  void EndCopyFrom(char * error_msg) {
    PQputCopyEnd(connection_, error_msg);
    this->copyInMode_ = false;
  }

};


extern "C" void init (Handle<Object> target)
{
  NanScope();
  Connection::Init(target);
}
NODE_MODULE(binding, init)
