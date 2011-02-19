#include <libpq-fe.h>
#include <node.h>
#include <node_events.h>
#include <assert.h>
#include <stdlib.h>

#define LOG(msg) printf("%s\n",msg)
#define THROW(msg) return ThrowException(Exception::Error(String::New(msg)));

using namespace v8;
using namespace node;

static Persistent<String> connect_symbol;

class Connection : public EventEmitter {

public:

  static void
  Init (Handle<Object> target)
  {
    HandleScope scope;
    Local<FunctionTemplate> t = FunctionTemplate::New(New);

    t->Inherit(EventEmitter::constructor_template);
    t->InstanceTemplate()->SetInternalFieldCount(1);
    t->SetClassName(String::NewSymbol("Connection"));

    connect_symbol = NODE_PSYMBOL("connect");

    NODE_SET_PROTOTYPE_METHOD(t, "connect", Connect);
    NODE_SET_PROTOTYPE_METHOD(t, "_sendQuery", SendQuery);

    target->Set(String::NewSymbol("Connection"), t->GetFunction());
    LOG("created class");
  }

  static void
  io_event(EV_P_ ev_io *w, int revents)
  {
    LOG("Received IO event");
    Connection *connection = static_cast<Connection*>(w->data);
    connection->HandleIOEvent(revents);
    //ev_io_stop(EV_A w);
  }


  static Handle<Value>
  Connect(const Arguments& args)
  {
    HandleScope scope;
    Connection *self = ObjectWrap::Unwrap<Connection>(args.This());
    if(args.Length() == 0 || !args[0]->IsString()) {
      THROW("Must include connection string as only argument to connect");
    }

    String::Utf8Value conninfo(args[0]->ToString());

    self->Connect(*conninfo);

    return Undefined();
  }

  static Handle<Value>
  SendQuery(const Arguments& args)
  {
    HandleScope scope;
    Connection *self = ObjectWrap::Unwrap<Connection>(args.This());
    String::Utf8Value queryText(args[0]->ToString());

    int result = self->Send(*queryText);
    if(result == 0) {
      THROW("PQsendQuery returned error code");
    }

    self->Flush();
    return Undefined();
  }

  int Send(const char *queryText)
  {
    return PQsendQuery(connection_, queryText);
  }

  void Flush()
  {
    if(PQflush(connection_) == 1) {
      ev_io_start(EV_DEFAULT_ &write_watcher_);
    }
  }


  ev_io read_watcher_;
  ev_io write_watcher_;
  PGconn *connection_;
  bool connecting_;
  Connection () : EventEmitter ()
  {
    connection_ = NULL;
    connecting_ = false;

    LOG("Initializing ev watchers");
    ev_init(&read_watcher_, io_event);
    read_watcher_.data = this;
    ev_init(&write_watcher_, io_event);
    write_watcher_.data = this;
  }

  ~Connection ()
  {
  }

  void StopWrite()
  {
    LOG("Stoping write watcher");
    ev_io_stop(EV_DEFAULT_ &write_watcher_);
  }

  void StartWrite()
  {
    LOG("Starting write watcher");
    ev_io_start(EV_DEFAULT_ &write_watcher_);
  }

  void StopRead()
  {
    LOG("Stoping read watcher");
    ev_io_stop(EV_DEFAULT_ &read_watcher_);
  }

  void StartRead()
  {
    LOG("Starting read watcher");
    ev_io_start(EV_DEFAULT_ &read_watcher_);
  }

  bool Connect(const char* conninfo)
  {
    connection_ = PQconnectStart(conninfo);

    if (!connection_) {
      LOG("Connection couldn't be created");
    } else {
      LOG("Connect created");
    }

    if (PQsetnonblocking(connection_, 1) == -1) {
      LOG("Unable to set connection to non-blocking");
      PQfinish(connection_);
      connection_ = NULL;
    }

    ConnStatusType status = PQstatus(connection_);

    switch(status) {
    case CONNECTION_STARTED:
      LOG("Status: CONNECTION_STARTED");
      break;

    case CONNECTION_BAD:
      LOG("Status: CONNECTION_BAD");
      break;

    case CONNECTION_MADE:
      LOG("Status: CONNECTION_MADE");
      break;

    case CONNECTION_AWAITING_RESPONSE:
      LOG("Status: CONNECTION_AWAITING_RESPONSE");
      break;

    case CONNECTION_AUTH_OK:
      LOG("Status: CONNECTION_AUTH_OKAY");
      break;

    case CONNECTION_SSL_STARTUP:
      LOG("Status: CONNECTION_SSL_STARTUP");
      break;

    case CONNECTION_SETENV:
      LOG("Status: CONNECTION_SETENV");
      break;

    default:
      LOG("Unknown connection status");
      break;
    }

    if(CONNECTION_BAD == status) {
      PQfinish(connection_);
      LOG("Bad connection status");
      connection_ = NULL;
    }

    int fd = PQsocket(connection_);
    if(fd < 0) {
      LOG("socket fd was negative. error");
    }
    printf("socket fd %d\n", fd);
    assert(PQisnonblocking(connection_));

    LOG("Setting watchers to socket");
    ev_io_set(&read_watcher_, fd, EV_READ);
    ev_io_set(&write_watcher_, fd, EV_WRITE);

    connecting_ = true;
    StartWrite();

    Ref();
    return true;
  }

protected:
  static Handle<Value>
  New (const Arguments& args)
  {
    HandleScope scope;
    Connection *connection = new Connection();
    connection->Wrap(args.This());

    return args.This();
  }

  void HandleConnectionIO()
  {
    PostgresPollingStatusType status = PQconnectPoll(connection_);
    switch(status) {
    case PGRES_POLLING_READING:
      LOG("Polled: PGRES_POLLING_READING");
      StopWrite();
      StartRead();
      break;
    case PGRES_POLLING_WRITING:
      LOG("Polled: PGRES_POLLING_WRITING");
      StopRead();
      StartWrite();
      break;
    case PGRES_POLLING_FAILED:
      LOG("Polled: PGRES_POLLING_FAILED");
      break;
    case PGRES_POLLING_OK:
      LOG("Polled: PGRES_POLLING_OK");
      connecting_ = false;
      Emit(connect_symbol, 0, NULL);
      StartRead();
    default:
      printf("Polled: %d\n", PQconnectPoll(connection_));
      break;
    }
  }

  void HandleIOEvent(int revents)
  {
    if(revents & EV_ERROR) {
      LOG("Connection error.");
      return;
    }

    if(connecting_) {
      HandleConnectionIO();
      return;
    }

    if(revents & EV_READ) {
      LOG("revents & EV_READ");
      if(PQconsumeInput(connection_) == 0) {
        LOG("Something happened, consume input is 0");
        return;
      }

      if (PQisBusy(connection_) == 0) {
        PGresult *result;
        while ((result = PQgetResult(connection_))) {
          LOG("Got result");
          //EmitResult(result);
          PQclear(result);
        }
        //Emit(ready_symbol, 0, NULL);
      } else {
        LOG("PQisBusy true");
      }

      //TODO look at this later
      PGnotify *notify;
      while ((notify = PQnotifies(connection_))) {
        LOG("Unhandled (not implemented) Notification received....");
        PQfreemem(notify);
      }


    }

    if(revents & EV_WRITE) {
      LOG("revents & EV_WRITE");
      if (PQflush(connection_) == 0) {
        StopWrite();
      }
    }
  }

private:
  void AfterPollingWriting()
  {
  }

};

extern "C" void
init (Handle<Object> target)
{
  HandleScope scope;
  Connection::Init(target);
}
