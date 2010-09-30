#watch file

def run_parser_tests
  system("node test/parser-tests.js")
  puts ""
  puts("waiting...")
  puts ""
end

watch('lib/(.*)\.js') { |md|
  run_parser_tests
}

watch('test/(.*)\.js') { |md|
  run_parser_tests
}
