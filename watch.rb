#watch file

def run_parser_tests
  system("node test/parser-tests.js")
  puts ""
  puts("#{Time.now} waiting...")
  puts ""
end

watch('lib/(.*)\.js') { |md|
  puts "lib changed"
  run_parser_tests
}

watch('test/(.*)\.js') { |md|
  puts "test changed"
  run_parser_tests
}
