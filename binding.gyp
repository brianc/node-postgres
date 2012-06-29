{
  'targets': [
    {
      'target_name': 'binding',
      'sources': [
        'src/binding.cc'
      ],
      'include_dirs': ['<!@(pg_config --includedir)'],
      'libraries' : ['-lpq -L<!@(pg_config --libdir)']
    }
  ]
}
