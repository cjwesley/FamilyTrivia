(function process(request, response) {
  var result = new TriviaTestRunner().runAll();
  response.setContentType('application/json');
  response.getStreamWriter().writeString(JSON.stringify(result));
})(request, response);
