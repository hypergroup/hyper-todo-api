var stack = require('simple-stack-common');
var uuid = require('uuid').v4;
var DS = require('nedb');
var pwd = process.cwd() + '/';
var db = {
  users: new DS({filename: pwd + 'users.db', autoload: true}),
  items: new DS({filename: pwd + 'items.db', autoload: true}),
  categories: new DS({filename: pwd + 'categories.db', autoload: true})
}

var app = module.exports = stack({
  base: {
    host: 'x-orig-host',
    path: 'x-orig-path',
    port: 'x-orig-port',
    proto: 'x-orig-proto'
  }
});

app.useBefore('router', function locals(req, res, next) {
  var url = req.base + (req.url === '/' ? '' : req.url);
  res.locals({
    url: url,
    root: req.get('x-root') || req.base
  });
  var _json = res.json;
  res.json = function(data) {
    var root = res.locals.root;
    data.root = {href: root};
    data.href = url;
    _json.call(res, data);
  };
  res.set('cache-control', 'max-age=3600');
  next();
});

app.param('user', function(req, res, next, id) {
  req.userBase = req.base + '/' + id;
  db.users.find(id, function(err, body) {
    if (err) return next(err);
    if (!body) return res.send(404);
    res.locals.user = body;
    next();
  });
});

app.param('item', function(req, res, next, id) {
  db.items.find(id, function(err, body) {
    if (err) return next(err);
    if (!body) return res.send(404);
    res.locals.item = body;
    next();
  });
});

app.get('/', function(req, res) {
  res.json({
    signup: {
      method: 'POST',
      action: req.base + '/signup',
      input: {
        username: {
          type: 'text',
          required: true
        },
        password: {
          type: 'password',
          required: true
        },
        'given-name': {
          type: 'text'
        },
        'family-name': {
          type: 'text'
        },
        avatar: {
          type: 'url'
        }
      }
    },
    login: {
      method: 'POST',
      action: req.base + '/login',
      input: {
        username: {
          type: 'text',
          required: true
        },
        password: {
          type: 'password',
          required: true
        }
      }
    }
  });
});

app.post('/signup', function(req, res, next) {
  var b = req.body;
  if (!b.username || !b.password) return res.send(400);
  var user = {
    username: b.username,
    password: b.password,
    givenName: b['given-name'] || '',
    familyName: b['family-name'] || '',
    avatar: b.avatar || ''
  };
  db.users.insert(user, function(err, doc) {
    if (err) return next(err);
    res.redirect(req.base + '/' + doc._id);
  });
});

app.post('/login', function(req, res, next) {
  var b = req.body;
  var username = b.username;
  if (!username) return res.send(400);
  db.users.find(username, function(err, user) {
    if (err) return next(err);
    if (!user) return res.send(404);
    if (user.password !== b.password) return res.send(401);
    res.redirect(req.base + '/' + user._id);
  });
});

app.get('/:user', function(req, res) {
  res.json({
    items: {
      href: req.userBase + '/items'
    },
    categories: {
      href: req.userBase + '/categories'
    },
    account: {
      href: req.userBase + '/account'
    }
  });
});

app.get('/:user/items', function(req, res) {
  var items = res.locals.items || [];
  res.json({
    collection: items.map(function(item) {
      if (typeof item === 'string') return {href: item};
      return {
        href: req.userBase + '/items/' + item.id
      };
    }),
    create: {
      method: 'POST',
      action: req.userBase + '/items',
      input: {
        title: {
          type: 'text',
          required: true
        },
        public: {
          type: 'checkbox'
        },
        'due-date': {
          type: 'datetime'
        },
        notes: {
          type: 'text'
        },
        categories: {
          type: 'select',
          multiple: true,
          suggestions: {
            href: req.userBase + '/categories'
          }
        }
      }
    }
  });
});

app.post('/:user/items', function(req, res) {
  var b = req.body;
  var item = {
    title: b.title,
    notes: b.notes,
    // TODO categories,
    public: !!b.public,
    created: (new Date).toISOString(),
    due: (new Date(b['due-date'])).toISOString()
  };
  db.items.insert([item], function(err, docs) {
    res.redirect(req.userBase + '/items/' + docs[0]._id);
  });
});

app.get('/:user/items/:item', function(req, res) {
  var id = req.params.item;
  var item = res.locals.item;
  var url = req.userBase + '/items/' + id;
  var cats =  (item.categories || []).map(function(cat) {
    return {
      href: req.userBase + '/categories/' + cat
    };
  });

  var body = {
    id: id,
    title: item.title,
    'due-date': item.due,
    notes: item.notes,
    public: item.public,
    categories: cats,
    owner: {
      href: req.userBase + '/account'
    },
    created: item.created,
    updated: item.updated,
    completed: item.completed,
    'delete': {
      method: 'DELETE',
      action: url
    },
    update: {
      method: 'POST',
      action: url,
      input: {
        _action: {
          type: 'hidden',
          value: 'update'
        },
        title: {
          type: 'text',
          required: true,
          value: item.title
        },
        public: {
          type: 'checkbox',
          value: item.public
        },
        due: {
          type: 'datetime',
          value: item.due
        },
        notes: {
          type: 'text',
          value: item.notes
        },
        categories: {
          type: 'select',
          multiple: true,
          suggestions: {
            href: req.userBase + '/categories'
          },
          value: cats
        }
      }
    },
    assign: {
      method: 'POST',
      action: url,
      input: {
        _action: {
          type: 'hidden',
          value: 'assign'
        },
        target: {
          type: 'url'
        }
      }
    }
  };

  if (item.assignee) body.assignee = {
    href: item.assignee
  };

  if (item.completed) {
    body.unfinish = {
      method: 'POST',
      action: url,
      input: {
        _action: {
          type: 'hidden',
          value: 'unfinish'
        }
      }
    };
  } else {
    body.complete = {
      method: 'POST',
      action: url,
      input: {
        _action: {
          type: 'hidden',
          value: 'complete'
        }
      }
    };
  }

  res.json(body);
});

app.post('/:user/items/:item', function(req, res) {

});

app.get('/:user/categories', function(req, res) {
  var url = req.userBase + '/categories';
  var categories = res.locals.categories;
  res.json({
    collection: categories.map(function(cat) {
      return {
        href: url + '/' + cat
      };
    }),
    create: {
      method: 'POST',
      action: url,
      input: {
        title: {
          type: 'text',
          required: true
        }
      }
    }
  });
});

app.get('/:user/account', function(req, res) {
  var user = res.locals.user;
  res.json({
    username: user.username,
    'given-name': user.givenName,
    'family-name': user.familyName,
    avatar: {
      src: user.avatar
    },
    created: user.created,
    updated: user.updated,
    update: {
      method: 'POST',
      action: req.userBase + '/account',
      input: {
        _action: {
          type: 'hidden',
          value: 'update'
        },
        username: {
          type: 'text',
          required: true,
          value: user.username
        },
        'given-name': {
          type: 'text',
          value: user.givenName
        },
        'family-name': {
          type: 'text',
          value: user.familyName
        },
        avatar: {
          type: 'url',
          value: user.avatar
        }
      }
    },
    'change-password': {
      method: 'POST',
      action: req.userBase + '/account',
      input: {
        _action: {
          type: 'hidden',
          value: 'change-password'
        },
        current: {
          type: 'password',
          required: true
        },
        'new': {
          type: 'password',
          required: true
        }
      }
    },
    'delete': {
      method: 'DELETE',
      action: req.userBase + '/account'
    },
    'assign': {
      method: 'POST',
      action: req.userBase + '/assign',
      input: {
        item: {
          type: 'url',
          required: true
        }
      }
    }
  });
});
