{
  'targets': [
    {
      'target_name': 'binding',
      'sources': [
        'src/binding.cc'
      ],
      'conditions' : [
        ['OS=="mac"', {
          'include_dirs': ['<!@(pg_config --includedir)'],
          'libraries' : ['-lpq -L<!@(pg_config --libdir)']
        }],
        ['OS=="linux"', {
          'include_dirs': ['<!@(pg_config --includedir)'],
          'libraries' : ['-lpq -L<!@(pg_config --libdir)']
        }],
        ['OS=="win"', {
          'include_dirs': ['<!@(pg_config --includedir)'],
          'libraries' : ['libpq.lib'],
          'msvs_settings': {
            'VCLinkerTool' : {
              'AdditionalLibraryDirectories' : [
                '<!@(pg_config --libdir)\\'
              ]
            },
          }
        }]
      ]
    }
  ]
}
