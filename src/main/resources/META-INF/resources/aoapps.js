/*
 * ao-messaging-http-client-js - JavaScript client for asynchronous bidirectional messaging over HTTP.
 * Copyright (C) 2014, 2016, 2019, 2021, 2022  AO Industries, Inc.
 *     support@aoindustries.com
 *     7262 Bull Pen Cir
 *     Mobile, AL 36695
 *
 * This file is part of ao-messaging-http-client-js.
 *
 * ao-messaging-http-client-js is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * ao-messaging-http-client-js is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with ao-messaging-http-client-js.  If not, see <https://www.gnu.org/licenses/>.
 */
if (typeof aoapps === 'undefined') {
  aoapps = {};
}

aoapps.lang = new function() {
  // <editor-fold desc="Exception" defaultstate="collapsed">
  /**
   * @constructor
   */
  var Exception = this.Exception = function(message) {
    this.message = message;
  };

  Exception.prototype.type = 'aoapps.lang.Exception';

  Exception.prototype.toString = function() {
    return (this.message !== undefined)
      ? (this.type + ": " + this.message)
      : this.type;
  };
  // </editor-fold>

  // <editor-fold desc="AssertionError" defaultstate="collapsed">
  /**
   * @constructor
   */
  var AssertionError = this.AssertionError = function(message) {
    Exception.call(this, message);
  };

  AssertionError.prototype = new Exception();
  AssertionError.prototype.constructor = AssertionError;

  AssertionError.prototype.type = 'aoapps.lang.AssertionError';
  // </editor-fold>

  // <editor-fold desc="AbstractMethodError" defaultstate="collapsed">
  /**
   * @constructor
   */
  var AbstractMethodError = this.AbstractMethodError = function(methodName) {
    Exception.call(
      this,
      (methodName !== undefined)
        ? ("Abstract method not implemented: " + methodName)
        : "Abstract method not implemented"
    );
  };

  AbstractMethodError.prototype = new Exception();
  AbstractMethodError.prototype.constructor = AbstractMethodError;

  AbstractMethodError.prototype.type = 'aoapps.lang.AbstractMethodError';
  // </editor-fold>

  // <editor-fold desc="IllegalArgumentException" defaultstate="collapsed">
  /**
   * @constructor
   */
  var IllegalArgumentException = this.IllegalArgumentException = function(message) {
    Exception.call(this, message);
  };

  IllegalArgumentException.prototype = new Exception();
  IllegalArgumentException.prototype.constructor = IllegalArgumentException;

  IllegalArgumentException.prototype.type = 'aoapps.lang.IllegalArgumentException';
  // </editor-fold>
};

aoapps.io = new function() {
  // <editor-fold desc="IOException" defaultstate="collapsed">
  /**
   * @constructor
   */
  var IOException = this.IOException = function(message) {
    aoapps.lang.Exception.call(this, message);
  };

  IOException.prototype = new aoapps.lang.Exception();
  IOException.prototype.constructor = IOException;

  IOException.prototype.type = 'aoapps.io.IOException';
  // </editor-fold>
};

aoapps.messaging = new function() {
  // <editor-fold desc="SocketException" defaultstate="collapsed">
  /**
   * @constructor
   */
  var SocketException = this.SocketException = function(message) {
    aoapps.lang.Exception.call(this, message);
  };

  SocketException.prototype = new aoapps.lang.Exception();
  SocketException.prototype.constructor = SocketException;

  SocketException.prototype.type = 'aoapps.messaging.SocketException';
  // </editor-fold>
};

aoapps.messaging.http = new function() {
  // <editor-fold desc="HttpSocket" defaultstate="collapsed">
  /**
   * @constructor
   */
  var HttpSocket = this.HttpSocket = function(id, connectTime, endpoint) {
    /** Server should normally respond within 60 seconds even if no data coming back. */
    var READ_TIMEOUT = 2 * 60 * 1000;

    var thisSocket = this;

    this.id = id;
    this.connectTime = connectTime;
    this.endpoint = endpoint;

    var inQueue = {};
    var inSeq = 1;

    var outQueue = new Array();

    var outSeq = 1;

    var closeTime = null;

    /**
     * The set of all active requests.
     */
    var requests = new Array();

    var close = this.close = function() {
      if (closeTime === null) {
        closeTime = (new Date()).getTime();
        // Cancel all current requests
        for (var i=0; i<requests.length; i++) {
          requests[i].abort();
        }
        requests = new Array();
      }
    };

    var isClosed = this.isClosed = function() {
      return closeTime !== null;
    };

    var listeners = Array();
    this.addSocketListener = function(listener) {
      listeners.push(listener);
    };

    var sendIfNeeded = function() {
      if (
        !isClosed()
        && (
          requests.length===0
          || (requests.length===1 && outQueue.length!==0)
        )
      ) {
        // Build the data object
        var data = {
          action : "messages",
          id : id,
          l : outQueue.length
        };
        for (var i=0; i<outQueue.length; i++) {
          var message = outQueue[i];
          // Sequence
          data["s" + i] = outSeq.toString();
          outSeq++;
          // Type
          data["t" + i] = "s";
          // Message
          data["m" + i] = message.toString();
        }
        // Clear the queue
        while (outQueue.length > 0) outQueue.pop();
        // Contact the server
        var currentRequest = jQuery.ajax({
          cache : false,
          timeout : READ_TIMEOUT,
          type : "POST",
          url : endpoint,
          data : data,
          dataType : "xml",
          success : function(data, textStatus, jqXHR) {
            if (!isClosed()) {
              // Parse the response
              // Add all messages to the inQueue by sequence to handle out-of-order messages
              jQuery(data).find('messages').find('message').each(function() {
                var messageElem = jQuery(this);
                // Get the sequence
                var seq = messageElem.attr("seq");
                // Get the type
                var type = messageElem.attr("type");
                // Get the message string
                var message;
                if (type==="s") {
                  message = messageElem.text();
                } else {
                  throw new aoapps.lang.AssertionError("Unsupported message type: " + type);
                }
                if (inQueue[seq] !== undefined) {
                  throw new aoapps.io.IOException("Duplicate incoming sequence: " + seq);
                }
                inQueue[seq] = message;
              });
              // Gather as many messages that have been delivered in-order
              var messages=new Array();
              while (true) {
                var message = inQueue[inSeq.toString()];
                if (message !== undefined) {
                  delete inQueue[inSeq.toString()];
                  messages.push(message);
                  inSeq++;
                } else {
                  // Break in the sequence
                  break;
                }
              }
              if (messages.length !== 0) {
                for (var i=0; i<listeners.length; i++) {
                  listeners[i].onMessages(thisSocket, messages);
                }
              }
            }
          },
          error : function(jqXHR, textStatus, errorThrown) {
            if (!isClosed()) {
              if (jqXHR.status===0) {
                // Have only seen status zero when user is leaving page.
                // TODO: This assumption may be incorrect and would be better to have other way to know if error is caused simply by the user leaving the page.
                close();
              } else {
                var exc = new aoapps.io.IOException(jqXHR.status + " " + errorThrown);
                for (var i=0; i<listeners.length; i++) {
                  listeners[i].onError(thisSocket, exc);
                }
              }
            }
          },
          complete : function(jqXHR, textStatus) {
            if (!isClosed()) {
              var newRequests = new Array();
              for (var i=0; i<requests.length; i++) {
                var request = requests[i];
                if (request !== currentRequest) newRequests.push(request);
              }
              requests = newRequests;
              sendIfNeeded();
            }
          }
        });
        requests.push(currentRequest);
      }
    };

    this.start = function(onStart, onError) {
      if (isClosed()) {
        if (onError) onError(new aoapps.messaging.SocketException("Socket is closed"));
      } else {
        sendIfNeeded();
        if (onStart) onStart(thisSocket);
      }
    };

    var sendMessages = this.sendMessages = function(messages) {
      if (!isClosed()) {
        for (var i=0; i<messages.length; i++) {
          outQueue.push(messages[i]);
        }
        sendIfNeeded();
      }
    };

    this.sendMessage = function(message) {
      sendMessages([message]);
    };
  };
  // </editor-fold>

  // <editor-fold desc="HttpSocketClient" defaultstate="collapsed">
  /**
   * Client component for bi-directional messaging over HTTP.
   */
  this.HttpSocketClient = new function() {
    /**
     * Asynchronously connects.
     */
    this.connect = function(endpoint, timeout, onConnect, onError) {
      var connectTime = (new Date()).getTime();
      jQuery.ajax({
        cache : false,
        timeout : timeout,
        type : "POST",
        url : endpoint,
        data : {
          action : "connect"
        },
        dataType : "xml",
        success : function(data, textStatus, jqXHR) {
          // Parse the response
          var id = jQuery(data).find('connection').attr('id');
          if (onConnect) onConnect(new HttpSocket(id, connectTime, endpoint));
        },
        error : function(jqXHR, textStatus, errorThrown) {
          if (onError) onError(new aoapps.io.IOException(jqXHR.status + " " + errorThrown));
        }
      });
    };
  };
  // </editor-fold>
};
