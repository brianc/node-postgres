{
  'targets': [
    {
      'target_name': 'binding',
      'sources': ['src/binding.cc'],
      'include_dirs': [
        '<!@(pg_config --includedir)',
        '<!(node -e "require(\'nan\')")'
      ],
      'conditions' : [
        ['OS=="win"', {
          'conditions' : [
            ['"<!@(cmd /C where /Q pg_config || echo n)"!="n"',
              {
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
                'libraries' : ['-lpq -L<!@(pg_config --libdir)']
              }
            ]
          ]
        }]
      ]
    }
  ]
}
