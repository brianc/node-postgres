#watch file
def run_test_file(f)
  puts "running #{f}"
  system "node #{f}"
  puts "done"
end
watch('lib/(.*)\.js') { |md|
  puts Dir["test/*.js"].each { |f| run_test_file(f) }
}

watch('test/(.*)\.js') { |md|
  run_test_file(md)
}
