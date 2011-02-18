#include <libpq-fe.h>
#include <node.h>
#include <node_events.h>
#include <assert.h>
#include <stdlib.h>

#define LOG(msg) printf("%s\n",msg)

using namespace v8;
using namespace node;

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

    NODE_SET_PROTOTYPE_METHOD(t, "test", Test);

    target->Set(String::NewSymbol("Connection"), t->GetFunction());
    LOG("created class");
  }

  static Handle<Value>
  Test(const Arguments& args)
  {
    HandleScope scope;

    PGconn *connection_ = PQconnectStart("");

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
    printf("status: %d\n", status);
    if(CONNECTION_BAD == status) {
      PQfinish(connection_);
      LOG("Bad connection status");
      connection_ = NULL;
    }

    int fd = PQsocket(connection_);
    if(fd < 0) {
      LOG("socket fd was negative. error");
    }
    
    LOG("Initializing ev watchers");
    ev_io read_watcher;
    ev_io write_watcher;
    ev_init(&read_watcher, io_event);
    ev_init(&write_watcher, io_event);

    ev_io_set(&read_watcher, fd, EV_READ);
    ev_io_set(&write_watcher, fd, EV_WRITE);
    
    ev_io_start(EV_DEFAULT_ &write_watcher);
    LOG("EV started");
    Local<String> result = String::New("Hello world");
    return scope.Close(result);
  }

  static void
  io_event(EV_P_ ev_io *w, int revents)
  {
    LOG("Received IO event");
  }

  Connection () : EventEmitter ()
  {
  }

  ~Connection ()
  {
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

private:
  ev_io read_watcher_;
  ev_io write_watcher_;

};

extern "C" void
init (Handle<Object> target)
{
  HandleScope scope;
  Connection::Init(target);
}
