package br.com.atlas.sst.homologacao;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.*;
import android.widget.TextView;
import androidx.webkit.*;
import org.json.JSONObject;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.*;
import to.holepunch.bare.kit.IPC;
import to.holepunch.bare.kit.Worklet;

public final class MainActivity extends Activity {
 private static final String ORIGIN="https://appassets.androidplatform.net";
 private static final String PAGE=ORIGIN+"/assets/ui/index.html";
 private WebView web;
 private Worklet worklet;
 private IPC ipc;
 private boolean foreground,ready,destroyed,pickingFile,resumeFromPicker;
 private long sequence,generation;
 private final ByteArrayOutputStream incoming=new ByteArrayOutputStream();
 private final ArrayDeque<ByteBuffer> writes=new ArrayDeque<>();
 private final Map<String,Reply> replies=new HashMap<>();
 private boolean writing;
 private ValueCallback<Uri[]> fileCallback;
 private interface Reply { void receive(JSONObject value); }

 @Override public void onCreate(Bundle state){
  super.onCreate(state);
  try{
   if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))throw new IllegalStateException("Atualize o Android System WebView para abrir a homologação.");
   web=new WebView(this);setContentView(web);
   web.setOnApplyWindowInsetsListener((view,insets)->{
    if(android.os.Build.VERSION.SDK_INT>=30){android.graphics.Insets bars=insets.getInsets(android.view.WindowInsets.Type.systemBars()|android.view.WindowInsets.Type.displayCutout()|android.view.WindowInsets.Type.ime());view.setPadding(bars.left,bars.top,bars.right,bars.bottom);}
    else view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;
   });
   WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
   settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
   settings.setJavaScriptCanOpenWindowsAutomatically(false);settings.setSupportMultipleWindows(false);settings.setSaveFormData(false);
   settings.setMediaPlaybackRequiresUserGesture(true);
   web.setDownloadListener((url,agent,disposition,mime,length)->{});
   WebViewAssetLoader loader=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
   web.setWebViewClient(new WebViewClient(){
    @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
     Uri url=request.getUrl();
     if("https".equals(url.getScheme())&&"appassets.androidplatform.net".equals(url.getHost())&&url.getPort()==-1){
      WebResourceResponse asset=loader.shouldInterceptRequest(url);if(asset!=null){if(url.getPath().endsWith(".mjs"))asset.setMimeType("application/javascript");return asset;}
     }
     return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
    }
    @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !PAGE.equals(request.getUrl().toString());}
   });
   web.setWebChromeClient(new WebChromeClient(){
    @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams parameters){
     if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;pickingFile=true;
     Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("*/*");
     intent.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"application/pdf","image/png","image/jpeg","image/webp"});
     try{startActivityForResult(intent,31);}catch(Exception error){fileCallback.onReceiveValue(null);fileCallback=null;pickingFile=false;}return true;
    }
   });
   WebViewCompat.addWebMessageListener(web,"SstAndroid",Collections.singleton(ORIGIN),(view,message,origin,mainFrame,proxy)->{
    if(!foreground||!ready||!mainFrame||!ORIGIN.equals(origin.toString()))return;
    try{
     String raw=message.getData();if(raw==null||raw.getBytes(StandardCharsets.UTF_8).length>1400000)throw new IllegalArgumentException();
     JSONObject request=new JSONObject(raw);String clientId=request.getString("id");
     if(!clientId.matches("[0-9]{1,16}")||replies.size()>20)throw new IllegalArgumentException();
     long pageGeneration=generation;
     submit(request,value->{
      if(!foreground||destroyed||pageGeneration!=generation)return;
      try{value.put("id",clientId);proxy.postMessage(value.toString());}catch(Exception ignored){}
     });
    }catch(Exception ignored){/* Invalid requests have no access to the core. */}
   });
   worklet=new Worklet(null);
   ipc=new IPC(worklet);
   ipc.readable(this::readAvailable);
   worklet.start("/core.bundle",getAssets().open("core.bundle"),new String[]{new File(getFilesDir(),"sst-homologacao").getAbsolutePath()});
  }catch(Throwable error){fail("Não foi possível iniciar o SST de homologação. "+(error instanceof IllegalStateException?error.getMessage():"O núcleo Android não carregou."));}
 }
 private void readAvailable(){
  try{
   ByteBuffer chunk;
   while((chunk=ipc.read())!=null){
    if(!chunk.hasRemaining()){fail("O núcleo local foi encerrado. Feche e abra o aplicativo.");return;}
    while(chunk.hasRemaining()){
     int next=chunk.get()&255;
     if(next!=10){incoming.write(next);if(incoming.size()>4000000)throw new IOException("IPC limit");continue;}
     JSONObject value=new JSONObject(incoming.toString(StandardCharsets.UTF_8.name()));incoming.reset();
     String event=value.optString("event");
     if(event.equals("ready")){ready=true;if(foreground)lockThenLoad();}
     else if(event.equals("fatal")){fail("Não foi possível abrir a base local de homologação.");return;}
     else{Reply reply=replies.remove(value.optString("id"));if(reply!=null)reply.receive(value);}
    }
   }
  }catch(Exception error){fail("Falha de comunicação com o núcleo local. Feche e abra o aplicativo.");}
 }
 private void submit(JSONObject request,Reply reply)throws Exception{
  String id="native_"+(++sequence);request.put("id",id);replies.put(id,reply);
  writes.add(ByteBuffer.wrap((request.toString()+"\n").getBytes(StandardCharsets.UTF_8)));flush();
 }
 private void flush(){
  if(writing||writes.isEmpty()||destroyed)return;writing=true;
  ipc.write(writes.remove(),error->{writing=false;if(error!=null)fail("Falha ao enviar comando ao núcleo local.");else flush();});
 }
 private void lockThenLoad(){
  try{long current=++generation;submit(new JSONObject().put("action","logout"),value->{if(foreground&&!destroyed&&current==generation&&value.optBoolean("ok"))web.loadUrl(PAGE);});}
  catch(Exception error){fail("Não foi possível bloquear a sessão anterior.");}
 }
 private void fail(String message){
  ready=false;replies.clear();if(web!=null)web.loadUrl("about:blank");TextView text=new TextView(this);text.setPadding(24,48,24,24);text.setText(message);setContentView(text);
 }
 @Override protected void onResume(){super.onResume();foreground=true;if(pickingFile||resumeFromPicker){resumeFromPicker=false;return;}if(ready)lockThenLoad();}
 @Override protected void onPause(){
  foreground=false;if(pickingFile){super.onPause();return;}generation++;replies.clear();if(web!=null)web.loadUrl("about:blank");
  if(ready)try{submit(new JSONObject().put("action","logout"),value->{});}catch(Exception ignored){}
  super.onPause();
 }
 @Override protected void onActivityResult(int request,int result,Intent data){
  super.onActivityResult(request,result,data);
  if(request==31&&fileCallback!=null){pickingFile=false;resumeFromPicker=true;fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));fileCallback=null;}
 }
 @Override protected void onDestroy(){
  destroyed=true;ready=false;replies.clear();writes.clear();
  if(fileCallback!=null)fileCallback.onReceiveValue(null);
  if(ipc!=null)ipc.close();if(worklet!=null)worklet.terminate();
  if(web!=null){web.loadUrl("about:blank");web.destroy();}super.onDestroy();
 }
 public WebView testWebView(){return web;}
}
