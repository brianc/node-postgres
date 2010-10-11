#watch file
watch('lib/(.*)\.js') { |md|
  system "node test-units.js"
}

watch('test/(.*)\.js') { |md|
  system "node test-units.js"
}
