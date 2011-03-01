import Options, Utils
from os import unlink, symlink, popen
from os.path import exists

srcdir = '.'
blddir = 'build'
VERSION = '0.0.1'

def set_options(opt):
  opt.tool_options('compiler_cxx')

def configure(conf):
  conf.check_tool('compiler_cxx')
  conf.check_tool('node_addon')

  pg_config = conf.find_program('pg_config', var='PG_CONFIG', mandatory=True)
  pg_libdir = popen("%s --libdir" % pg_config).readline().strip()
  conf.env.append_value("LIBPATH_PG", pg_libdir)
  conf.env.append_value("LIB_PG", "pq")
  pg_includedir = popen("%s --includedir" % pg_config).readline().strip()
  conf.env.append_value("CPPPATH_PG", pg_includedir)

def build(bld):
  obj = bld.new_task_gen('cxx', 'shlib', 'node_addon')
  obj.cxxflags = ["-g", "-D_LARGEFILE_SOURCE", "-Wall"]
  obj.target = 'binding'
  obj.source = "./src/binding.cc"
  obj.uselib = "PG"

def test(test):
  Utils.exec_command("node test/native/connection-tests.js")
  Utils.exec_command("node test/native/evented-api-tests.js")
