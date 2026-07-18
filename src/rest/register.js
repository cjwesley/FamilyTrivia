// Public (unauthenticated), POST-only Scripted REST operation. Body:
// {token, nickname, email, password}. Thin wrapper over
// TriviaRegistration.register() -- returns its result verbatim, never adds
// or strips fields.
//
// Security requirements (carried forward from the Task 5 review, binding):
//  1. The whole body is wrapped in try/catch. On any internal failure
//     (including inputs TriviaRegistration itself doesn't defend against,
//     e.g. a malformed/non-JSON body where `request.body.data` throws) this
//     script logs the exception server-side via gs.error and returns the
//     same opaque {ok:false, reason:'error'} shape TriviaRegistration
//     itself uses -- an anonymous caller must never see a stack trace or a
//     platform error envelope.
//  2. IP extraction: first entry of X-Forwarded-For (split on comma,
//     trimmed) when present, else 'unknown'. There is no second
//     ("platform request source IP") path on this instance: the Scripted
//     REST request object (sn_ws.RESTAPIRequest, see
//     fluent/node_modules/@servicenow/glide/src/sn_ws_int/RESTAPIRequest.d.ts)
//     exposes only getHeader/getRequestedQueryCategory/
//     getSupportedResponseContentTypes plus the body/queryParams/pathParams/
//     headers/queryString/url/uri properties -- no remote-address/source-IP
//     property or method is documented or present, so absence of
//     X-Forwarded-For falls straight through to 'unknown' rather than a
//     platform lookup.
//  3. The request body is NEVER logged, in success or failure -- only the
//     exception object/message (never containing form field values) is
//     passed to gs.error.
(function process(request, response) {
  var result;
  try {
    var body = (request.body && request.body.data) || {};

    var ip = 'unknown';
    var xff = request.getHeader('X-Forwarded-For');
    if (xff) {
      var first = String(xff).split(',')[0].trim();
      if (first) ip = first;
    }

    result = new TriviaRegistration().register(body.token, body.nickname, body.email, body.password, ip);
  } catch (e) {
    gs.error('x_tekvo_famtriv register endpoint: internal error - ' + e);
    result = { ok: false, reason: 'error' };
  }
  response.setContentType('application/json');
  response.getStreamWriter().writeString(JSON.stringify(result));
})(request, response);
