#include <libpq-fe.h>
#include <node.h>
#include <string.h>
#include <assert.h>
#include <stdlib.h>

#define LOG(msg) printf("%s\n",msg);
#define TRACE(msg) //printf("%s\n", msg);


#define THROW(msg) return ThrowException(Exception::Error(String::New(msg)));

using namespace v8;
using namespace node;

static Persistent<String> severity_symbol;
static Persistent<String> code_symbol;
static Persistent<String> detail_symbol;
static Persistent<String> hint_symbol;
static Persistent<String> position_symbol;
static Persistent<String> internalPosition_symbol;
static Persistent<String> internalQuery_symbol;
static Persistent<String> where_symbol;
static Persistent<String> file_symbol;
static Persistent<String> line_symbol;
static Persistent<String> routine_symbol;
static Persistent<String> name_symbol;
static Persistent<String> value_symbol;
static Persistent<String> type_symbol;
static Persistent<String> channel_symbol;
static Persistent<String> payload_symbol;
static Persistent<String> emit_symbol;
static Persistent<String> command_symbol;

class Connection : public ObjectWrap {

public:

  //creates the V8 objects & attaches them to the module (target)
  static void
  Init (Handle<Object> target)
  {
    HandleScope scope;
    Local<FunctionTemplate> t = FunctionTemplate::New(New);

    t->InstanceTemplate()->SetInternalFieldCount(1);
    t->SetClassName(String::NewSymbol("Connection"));

    emit_symbol = NODE_PSYMBOL("emit");
    severity_symbol = NODE_PSYMBOL("severity");
    code_symbol = NODE_PSYMBOL("code");
    detail_symbol = NODE_PSYMBOL("detail");
    hint_symbol = NODE_PSYMBOL("hint");
    position_symbol = NODE_PSYMBOL("position");
    internalPosition_symbol = NODE_PSYMBOL("internalPosition");
    internalQuery_symbol = NODE_PSYMBOL("internalQuery");
    where_symbol = NODE_PSYMBOL("where");
    file_symbol = NODE_PSYMBOL("file");
    line_symbol = NODE_PSYMBOL("line");
    routine_symbol = NODE_PSYMBOL("routine");
    name_symbol = NODE_PSYMBOL("name");
    value_symbol = NODE_PSYMBOL("value");
    type_symbol = NODE_PSYMBOL("type");
    channel_symbol = NODE_PSYMBOL("channel");
    payload_symbol = NODE_PSYMBOL("payload");
    command_symbol = NODE_PSYMBOL("command");


    NODE_SET_PROTOTYPE_METHOD(t, "connect", Connect);
    NODE_SET_PROTOTYPE_METHOD(t, "_sendQuery", SendQuery);
    NODE_SET_PROTOTYPE_METHOD(t, "_sendQueryWithParams", SendQueryWithParams);
    NODE_SET_PROTOTYPE_METHOD(t, "_sendPrepare", SendPrepare);
    NODE_SET_PROTOTYPE_METHOD(t, "_sendQueryPrepared", SendQueryPrepared);
    NODE_SET_PROTOTYPE_METHOD(t, "cancel", Cancel);
    NODE_SET_PROTOTYPE_METHOD(t, "end", End);

    target->Set(String::NewSymbol("Connection"), t->GetFunction());
    TRACE("created class");
  }

  //static function called by libev as callback entrypoint
  static void
  io_event(EV_P_ ev_io *w, int revents)
  {
    TRACE("Received IO event");
    Connection *connection = static_cast<Connection*>(w->data);
    connection->HandleIOEvent(revents);
  }

  //v8 entry point into Connection#connect
  static Handle<Value>
  Connect(const Arguments& args)
  {
    HandleScope scope;
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

    return Undefined();
  }

  //v8 entry point into Connection#cancel
  static Handle<Value>
  Cancel(const Arguments& args)
  {
    HandleScope scope;
    Connection *self = ObjectWrap::Unwrap<Connection>(args.This());

    bool success = self->Cancel();
    if(!success) {
      self -> EmitLastError();
      self -> DestroyConnection();
    }

    return Undefined();
  }

  //v8 entry point into Connection#_sendQuery
  static Handle<Value>
  SendQuery(const Arguments& args)
  {
    HandleScope scope;
    Connection *self = ObjectWrap::Unwrap<Connection>(args.This());
    if(!args[0]->IsString()) {
      THROW("First parameter must be a string query");
    }

    char* queryText = MallocCString(args[0]);
    int result = self->Send(queryText);
    free(queryText);
    if(result == 0) {
      THROW("PQsendQuery returned error code");
    }
    //TODO should we flush before throw?
    self->Flush();
    return Undefined();
  }

  //v8 entry point into Connection#_sendQueryWithParams
  static Handle<Value>
  SendQueryWithParams(const Arguments& args)
  {
    HandleScope scope;
    //dispatch non-prepared parameterized query
    return DispatchParameterizedQuery(args, false);
  }

  //v8 entry point into Connection#_sendPrepare(string queryName, string queryText, int nParams)
  static Handle<Value>
  SendPrepare(const Arguments& args)
  {
    HandleScope scope;

    Connection *self = ObjectWrap::Unwrap<Connection>(args.This());
    String::Utf8Value queryName(args[0]);
    String::Utf8Value queryText(args[1]);
    int length = args[2]->Int32Value();
    self->SendPrepare(*queryName, *queryText, length);

    return Undefined();
  }

  //v8 entry point into Connection#_sendQueryPrepared(string queryName, string[] paramValues)
  static Handle<Value>
  SendQueryPrepared(const Arguments& args)
  {
    HandleScope scope;
    //dispatch prepared parameterized query
    return DispatchParameterizedQuery(args, true);
  }

  static Handle<Value>
  DispatchParameterizedQuery(const Arguments& args, bool isPrepared)
  {
    HandleScope scope;
    Connection *self = ObjectWrap::Unwrap<Connection>(args.This());

    String::Utf8Value queryName(args[0]);
    //TODO this is much copy/pasta code
    if(!args[0]->IsString()) {
      THROW("First parameter must be a string");
    }

    if(!args[1]->IsArray()) {
      THROW("Values must be an array");
    }

    Handle<Value> params = args[1];

    Local<Array> jsParams = Local<Array>::Cast(args[1]);
    int len = jsParams->Length();


    char** paramValues = ArgToCStringArray(jsParams);
    if(!paramValues) {
      THROW("Unable to allocate char **paramValues from Local<Array> of v8 params");
    }

    char* queryText = MallocCString(args[0]);

    int result = 0;
    if(isPrepared) {
      result = self->SendPreparedQuery(queryText, len, paramValues);
    } else {
      result = self->SendQueryParams(queryText, len, paramValues);
    }

    free(queryText);
    ReleaseCStringArray(paramValues, len);
    if(result == 1) {
      return Undefined();
    }
    self->EmitLastError();
    THROW("Postgres returned non-1 result from query dispatch.");
  }

  //v8 entry point into Connection#end
  static Handle<Value>
  End(const Arguments& args)
  {
    HandleScope scope;

    Connection *self = ObjectWrap::Unwrap<Connection>(args.This());

    self->End();
    return Undefined();
  }

  ev_io read_watcher_;
  ev_io write_watcher_;
  PGconn *connection_;
  bool connecting_;
  Connection () : ObjectWrap ()
  {
    connection_ = NULL;
    connecting_ = false;

    TRACE("Initializing ev watchers");
    ev_init(&read_watcher_, io_event);
    read_watcher_.data = this;
    ev_init(&write_watcher_, io_event);
    write_watcher_.data = this;
  }

  ~Connection ()
  {
  }

protected:
  //v8 entry point to constructor
  static Handle<Value>
  New (const Arguments& args)
  {
    HandleScope scope;
    Connection *connection = new Connection();
    connection->Wrap(args.This());

    return args.This();
  }

  int Send(const char *queryText)
  {
    int rv = PQsendQuery(connection_, queryText);
    StartWrite();
    return rv;
  }

  int SendQueryParams(const char *command, const int nParams, const char * const *paramValues)
  {
    int rv = PQsendQueryParams(connection_, command, nParams, NULL, paramValues, NULL, NULL, 0);
    StartWrite();
    return rv;
  }

  int SendPrepare(const char *name, const char *command, const int nParams)
  {
    int rv = PQsendPrepare(connection_, name, command, nParams, NULL);
    StartWrite();
    return rv;
  }

  int SendPreparedQuery(const char *name, int nParams, const char * const *paramValues)
  {
    int rv = PQsendQueryPrepared(connection_, name, nParams, paramValues, NULL, NULL, 0);
    StartWrite();
    return rv;
  }

  int Cancel()
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
      ev_io_start(EV_DEFAULT_ &write_watcher_);
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
    connection_ = PQconnectStart(conninfo);

    if (!connection_) {
      LOG("Connection couldn't be created");
    }

    if (PQsetnonblocking(connection_, 1) == -1) {
      LOG("Unable to set connection to non-blocking");
      return false;
    }

    ConnStatusType status = PQstatus(connection_);

    if(CONNECTION_BAD == status) {
      LOG("Bad connection status");
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
    ev_io_set(&read_watcher_, fd, EV_READ);
    ev_io_set(&write_watcher_, fd, EV_WRITE);

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
    HandleScope scope;
    Handle<Value> notice = String::New(message);
    Emit("notice", &notice);
  }

  //called to process io_events from libev
  void HandleIOEvent(int revents)
  {
    if(revents & EV_ERROR) {
      LOG("Connection error.");
      return;
    }

    if(connecting_) {
      TRACE("Processing connecting_ io");
      HandleConnectionIO();
      return;
    }

    if(revents & EV_READ) {
      TRACE("revents & EV_READ");
      if(PQconsumeInput(connection_) == 0) {
        End();
	EmitLastError();
        LOG("Something happened, consume input is 0");
        return;
      }

      //declare handlescope as this method is entered via a libev callback
      //and not part of the public v8 interface
      HandleScope scope;

      if (PQisBusy(connection_) == 0) {
        PGresult *result;
        bool didHandleResult = false;
        while ((result = PQgetResult(connection_))) {
          HandleResult(result);
          didHandleResult = true;
          PQclear(result);
        }
        //might have fired from notification
        if(didHandleResult) {
          Emit("_readyForQuery");
        }
      }

      PGnotify *notify;
      while ((notify = PQnotifies(connection_))) {
        Local<Object> result = Object::New();
        result->Set(channel_symbol, String::New(notify->relname));
        result->Set(payload_symbol, String::New(notify->extra));
        Handle<Value> res = (Handle<Value>)result;
        Emit("notification", &res);
        PQfreemem(notify);
      }

    }

    if(revents & EV_WRITE) {
      TRACE("revents & EV_WRITE");
      if (PQflush(connection_) == 0) {
        StopWrite();
      }
    }
  }

  void HandleResult(PGresult* result)
  {
    ExecStatusType status = PQresultStatus(result);
    switch(status) {
    case PGRES_TUPLES_OK:
      {
        HandleTuplesResult(result);
        EmitCommandMetaData(result);
      }
      break;
    case PGRES_FATAL_ERROR:
      HandleErrorResult(result);
      break;
    case PGRES_COMMAND_OK:
    case PGRES_EMPTY_QUERY: 
      EmitCommandMetaData(result);
      break;
    default:
      printf("Unrecogized query status: %s\n", PQresStatus(status));
      break;
    }
  }

  void EmitCommandMetaData(PGresult* result)
  {
    HandleScope scope;
    Local<Object> info = Object::New();
    info->Set(command_symbol, String::New(PQcmdStatus(result)));
    info->Set(value_symbol, String::New(PQcmdTuples(result)));
    Handle<Value> e = (Handle<Value>)info;
    Emit("_cmdStatus", &e);
  }

  //maps the postgres tuple results to v8 objects
  //and emits row events
  //TODO look at emitting fewer events because the back & forth between
  //javascript & c++ might introduce overhead (requires benchmarking)
  void HandleTuplesResult(const PGresult* result)
  {
    HandleScope scope;
    int rowCount = PQntuples(result);
    for(int rowNumber = 0; rowNumber < rowCount; rowNumber++) {
      //create result object for this row
      Local<Array> row = Array::New();
      int fieldCount = PQnfields(result);
      for(int fieldNumber = 0; fieldNumber < fieldCount; fieldNumber++) {
        Local<Object> field = Object::New();
        //name of field
        char* fieldName = PQfname(result, fieldNumber);
        field->Set(name_symbol, String::New(fieldName));

        //oid of type of field
        int fieldType = PQftype(result, fieldNumber);
        field->Set(type_symbol, Integer::New(fieldType));

        //value of field
        if(PQgetisnull(result, rowNumber, fieldNumber)) {
          field->Set(value_symbol, Null());
        } else {
          char* fieldValue = PQgetvalue(result, rowNumber, fieldNumber);
          field->Set(value_symbol, String::New(fieldValue));
        }

        row->Set(Integer::New(fieldNumber), field);
      }

      Handle<Value> e = (Handle<Value>)row;
      Emit("_row", &e);
    }
  }

  void HandleErrorResult(const PGresult* result)
  {
    HandleScope scope;
    //instantiate the return object as an Error with the summary Postgres message
    Local<Object> msg = Local<Object>::Cast(Exception::Error(String::New(PQresultErrorField(result, PG_DIAG_MESSAGE_PRIMARY))));

    //add the other information returned by Postgres to the error object
    AttachErrorField(result, msg, severity_symbol, PG_DIAG_SEVERITY);
    AttachErrorField(result, msg, code_symbol, PG_DIAG_SQLSTATE);
    AttachErrorField(result, msg, detail_symbol, PG_DIAG_MESSAGE_DETAIL);
    AttachErrorField(result, msg, hint_symbol, PG_DIAG_MESSAGE_HINT);
    AttachErrorField(result, msg, position_symbol, PG_DIAG_STATEMENT_POSITION);
    AttachErrorField(result, msg, internalPosition_symbol, PG_DIAG_INTERNAL_POSITION);
    AttachErrorField(result, msg, internalQuery_symbol, PG_DIAG_INTERNAL_QUERY);
    AttachErrorField(result, msg, where_symbol, PG_DIAG_CONTEXT);
    AttachErrorField(result, msg, file_symbol, PG_DIAG_SOURCE_FILE);
    AttachErrorField(result, msg, line_symbol, PG_DIAG_SOURCE_LINE);
    AttachErrorField(result, msg, routine_symbol, PG_DIAG_SOURCE_FUNCTION);
    Handle<Value> m = msg;
    Emit("_error", &m);
  }

  void AttachErrorField(const PGresult *result, const Local<Object> msg, const Persistent<String> symbol, int fieldcode)
  {
    char *val = PQresultErrorField(result, fieldcode);
    if(val) {
      msg->Set(symbol, String::New(val));
    }
  }

  void End()
  {
    StopRead();
    StopWrite();
    DestroyConnection();
  }

private:
  //EventEmitter was removed from c++ in node v0.5.x
  void Emit(const char* message) {
    HandleScope scope;
    Handle<Value> args[1] = { String::New(message) };
    Emit(1, args);
  }

  void Emit(const char* message, Handle<Value>* arg) {
    HandleScope scope;
    Handle<Value> args[2] = { String::New(message), *arg };
    Emit(2, args);
  }

  void Emit(int length, Handle<Value> *args) {
    HandleScope scope;

    Local<Value> emit_v = this->handle_->Get(emit_symbol);
    assert(emit_v->IsFunction());
    Local<Function> emit_f = emit_v.As<Function>();

    TryCatch tc;
    emit_f->Call(this->handle_, length, args);
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
        StopWrite();
        StartRead();
        break;
      case PGRES_POLLING_WRITING:
        TRACE("Polled: PGRES_POLLING_WRITING");
        StopRead();
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
    Local<Value> exception = Exception::Error(String::New(message));
    Emit("_error", &exception);
  }

  void EmitLastError()
  {
    EmitError(PQerrorMessage(connection_));
  }

  void StopWrite()
  {
    TRACE("Stoping write watcher");
    ev_io_stop(EV_DEFAULT_ &write_watcher_);
  }

  void StartWrite()
  {
    TRACE("Starting write watcher");
    ev_io_start(EV_DEFAULT_ &write_watcher_);
  }

  void StopRead()
  {
    TRACE("Stoping read watcher");
    ev_io_stop(EV_DEFAULT_ &read_watcher_);
  }

  void StartRead()
  {
    TRACE("Starting read watcher");
    ev_io_start(EV_DEFAULT_ &read_watcher_);
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
      } else {
        //a paramter was not a string
        LOG("Parameter not a string");
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
};


extern "C" void init (Handle<Object> target)
{
  HandleScope scope;
  Connection::Init(target);
}
