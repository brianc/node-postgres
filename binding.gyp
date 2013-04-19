{
  'targets': [
    {
      'target_name': 'binding',
      'conditions' : [
        ['OS=="win"', {
          'conditions' : [
            ['"<!@(cmd /C where /Q pg_config || echo n)"!="n"',
              {
                'sources': ['src/binding.cc'],
                'include_dirs': ['<!@(pg_config --includedir)'],
                'libraries' : ['libpq.lib'],
                'msvs_settings': {
                  'VCLinkerTool' : {
                    'AdditionalLibraryDirectories' : [
                      '<!@(pg_config --libdir)\\'
                    ]
                  },
                }
              }
            ]
          ]
        }, { # OS!="win"
          'conditions' : [
            ['"y"!="n"', # ToDo: add pg_config existance condition that works on linux
              {
                'sources': ['src/binding.cc'],
                'include_dirs': ['<!@(pg_config --includedir)'],
                'libraries' : ['-lpq -L<!@(pg_config --libdir)']
              }
            ]
          ]
        }]
      ]
    }
  ]
}
