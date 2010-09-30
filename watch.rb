#watch file

watch('lib/(.*)\.js') { |md|
  system('echo "lib changed"')
}

watch('test/(.*)\.js') { |md|
  system("node #{md}")
  puts ""
  puts("waiting...")
  puts ""
}
