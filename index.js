'use strict';

// use this script at your own risk!

const request = require('request'),
      async = require('async');

const secret = 'sk_live_'; // your stripe key

function _listSubs(startAfter, subs, done) {
  let url = 'https://api.stripe.com/v1/subscriptions?limit=100';
  if (startAfter) {
    url += `&starting_after=${startAfter}`;
  }

  request.get(url, {
    auth: {
      user: secret,
      pass: ''
    }
  }, function(err, req, body) {
    const d = JSON.parse(body);

    let id = null;

    if (Array.isArray(d.data)) {
      d.data.forEach(function(s) {
        id = s.id;
        if (s.status !== 'canceled') {
          // uncomment to print out csv
          //console.log(`${id}, ${s.status}, ${s.plan && s.plan.id}, ${new Date(s.created*1000)}`);
          subs.push(id);
        }
      });
    }

    if (d.has_more) {
      _listSubs(id, subs, done);
    } else {
      if (typeof done === 'function') {
        done(subs);
      }
    }
  });
}

function _listCharges(startAfter, charges, total, since, done) {
  let url = 'https://api.stripe.com/v1/charges?limit=100';
  if (startAfter) {
    url += `&starting_after=${startAfter}`;
  }

  if (since && since instanceof Date) {
    url += `&created[gt]=${Math.floor(Number(since)/1000)}`;
  }

  request.get(url, {
    auth: {
      user: secret,
      pass: ''
    }
  }, function(err, req, body) {
    const d = JSON.parse(body);

    let id = null;

    if (Array.isArray(d.data)) {
      d.data.forEach(function(c) {
        id = c.id;
        if ((c.status === 'succeeded' || c.status === 'paid') && !c.refunded) {
          // uncomment to print out csv
          //console.log(`${id}, ${c.amount}, ${c.status}, ${new Date(c.created*1000)}`);
          total += c.amount;
          charges.push(id);
        }
      });
    }

    if (d.has_more) {
      _listCharges(id, charges, total, since, done);
    } else {
      if (typeof done === 'function') {
        done(charges, total);
      }
    }
  });
}

function listSubs(done) {
  _listSubs(null, [], done);
}

function listCharges(since, done) {
  if (typeof since === 'function') {
    done = since;
    since = null;
  }
  _listCharges(null, [], 0, since, done);
}

function cancel(sub, cb) {
  let url = `https://api.stripe.com/v1/subscriptions/${sub}`;
  console.log(`canceling ${sub}...`)

  request.delete(url, {
    auth: {
      user: secret,
      pass: ''
    }
  }, function(err, req, body) {
    let d;
    try {
      d = JSON.parse(body);
    } catch(e) {
      console.log(`json parse failed: ${body}, try again`)
      return cb(new Error('json parse failed'));
    }
    if (req.statusCode !== 200) {
      console.log(`failed to cancel: ${sub} ${req.statusCode}, try again`)
      return cb(new Error('failed to cancel'));
    }
    if (typeof cb === 'function') {
      cb();
    }
  });
}

function refund(chg, cb) {
  let url = 'https://api.stripe.com/v1/refunds';
  console.log(`refunding ${chg}...`)

  request.post(url, {
    auth: {
      user: secret,
      pass: ''
    },
    form: {
      charge: chg
    }
  }, function(err, req, body) {
    let d;
    try {
      d = JSON.parse(body);
    } catch(e) {
      console.log(`json parse failed: ${body}, try again`)
      return cb(new Error('json parse failed'));
    }
    if (req.statusCode !== 200) {
      console.log(`failed to refund: ${chg} ${req.statusCode}, try again`)
      return cb(new Error('failed to refund'));
    }
    if (typeof cb === 'function') {
      cb();
    }
  });
}

function doStuff() {
  // get all subscriptions and cancel
  listSubs(function(subs) {
    console.log(`found ${subs.length} subscriptions`);

    // cancel all subs
    async.parallelLimit(
      subs.map(function(id) {
        return function(cb) {
          cancel(id, cb);
        };
      }),
      10
    );
  });

  // get all charges since 2016-10-16 GMT+1400 and refund them
  // pass null for first arg if you want all charges
  listCharges(new Date('2016-10-16 GMT+1400'), function(charges, total) {
    console.log(`found ${charges.length} charges, total amount: ${(total/100).toFixed(2)}`);

    // refund payments
    async.parallelLimit(
      charges.map(function(id) {
        return function(cb) {
          refund(id, cb)
        };
      }),
      10
    );
  });
}

// doStuff();
