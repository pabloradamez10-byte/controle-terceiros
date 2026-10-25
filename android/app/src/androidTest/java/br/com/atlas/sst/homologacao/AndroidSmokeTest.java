package br.com.atlas.sst.homologacao;

import android.content.Intent;
import android.graphics.Bitmap;
import android.app.Instrumentation;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public final class AndroidSmokeTest {
 private Instrumentation getInstrumentation(){return InstrumentationRegistry.getInstrumentation();}
 private MainActivity activity;
 private String js(String source)throws Exception{
  AtomicReference<String> value=new AtomicReference<>();CountDownLatch latch=new CountDownLatch(1);
  getInstrumentation().runOnMainSync(()->activity.testWebView().evaluateJavascript(source,result->{value.set(result);latch.countDown();}));
  assertTrue("WebView callback timed out",latch.await(10,TimeUnit.SECONDS));return value.get();
 }
 private void waitFor(String expression)throws Exception{
  long end=System.currentTimeMillis()+45000;
  while(System.currentTimeMillis()<end){if("true".equals(js("Boolean("+expression+")")))return;Thread.sleep(150);}
  fail("WebView condition failed: "+expression+"; body="+js("document.body?.innerText.slice(-1800)"));
 }
 private void async(String expression)throws Exception{
  js("window.__smoke=null;(async()=>{try{await ("+expression+");window.__smoke='ok'}catch(error){window.__smoke=error.message}})()");
  waitFor("window.__smoke!==null");assertEquals("\"ok\"",js("window.__smoke"));
 }
 private void launch(){
  Intent intent=new Intent(getInstrumentation().getTargetContext(),MainActivity.class);intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
  activity=(MainActivity)getInstrumentation().startActivitySync(intent);
 }
 private void screenshot(String name)throws Exception{
  Bitmap image=getInstrumentation().getUiAutomation().takeScreenshot();assertNotNull(image);
  File output=new File(getInstrumentation().getTargetContext().getFilesDir(),name+".png");
  try(FileOutputStream stream=new FileOutputStream(output)){image.compress(Bitmap.CompressFormat.PNG,100,stream);}image.recycle();
 }
 @Test public void testRealAndroidCoreAndWebView()throws Exception{
  String password="Teste-"+UUID.randomUUID();
  try{
   launch();waitFor("document.getElementById('sst-native-initialize')");screenshot("01-login");
   js("document.getElementById('tss-auth-email').value='owner@sst.local';document.getElementById('tss-auth-password').value="+JSONObject.quote(password)+";document.getElementById('sst-native-initialize').click()");
   waitFor("document.body.classList.contains('tss-authenticated')");
   js("window.prompt=()=> 'Cadastro fictício no emulador';window.confirm=()=>true;window.alert=message=>{window.__lastAlert=message};abrirModalNovaEmpresa();Object.entries({'emp-razao':'Empresa fictícia Android','emp-cnpj':'11.111.111/0001-11','emp-resp':'Teste','emp-contrato-fim':'2030-01-01','emp-doc-dp':'2030-01-01','emp-doc-sesmt':'2030-01-01'}).forEach(([id,value])=>document.getElementById(id).value=value);salvarEmpresa()");
   async("tssSupabaseSyncNow().then(ok=>{if(!ok)throw Error(window.__lastAlert)})");
   async("(async()=>{const company=(await sstNativeHost.request({action:'state'}))[0].data.empresas[0];window.__company=company.id;showPage('cadastro');Object.entries({'f-nome':'Pessoa fictícia Android','f-cpf':'111.111.111-11','f-empresa':company.id,'f-funcao':'Teste','f-aso':'2030-01-01','f-integ':'2030-01-01'}).forEach(([id,value])=>document.getElementById(id).value=value);salvarTerceiro();if(!await tssSupabaseSyncNow())throw Error(window.__lastAlert);window.__person=(await sstNativeHost.request({action:'state'}))[0].data.terceiros[0].id})()");
   screenshot("02-cadastro");
   async("sstNativeHost.request({action:'users',body:{email:'portaria@sst.local',password:"+JSONObject.quote(password)+",role:'portaria',ativo:true,permissoes:{consultar:true,cadastrar:false,liberar:false}}})");
   String pdf;
   try(InputStream stream=getInstrumentation().getContext().getAssets().open("document.pdf.base64")){pdf=new String(stream.readAllBytes(),StandardCharsets.UTF_8).trim();}
   async("(async()=>{const meta=await sstNativeHost.request({action:'documents',body:{action:'upload',kind:'terceiro',ownerId:window.__person,filename:'homologacao.pdf',mime:'application/pdf',base64:"+JSONObject.quote(pdf)+"}});window.__pdfId=meta.storageId;const data=(await sstNativeHost.request({action:'documents',body:{action:'view',id:meta.storageId}})).dataUrl;v26VisualizarDataUrl(data,'application/pdf','PDF fictício de homologação')})()");
   waitFor("document.querySelector('.v26-doc-preview-body canvas')?.dataset.sstRendered==='true'");
   waitFor("!document.querySelector('.v26-doc-preview-body')?.textContent.includes('Não foi possível')");screenshot("03-pdf");
   String documentId=js("window.__pdfId");
   js("tssSair()");waitFor("document.getElementById('tss-auth-form')&&!document.body.classList.contains('tss-authenticated')");
   js("document.getElementById('tss-auth-email').value='portaria@sst.local';document.getElementById('tss-auth-password').value="+JSONObject.quote(password)+";document.getElementById('tss-auth-form').requestSubmit()");
   waitFor("document.body.classList.contains('tss-authenticated')");
   assertEquals("false",js("tssPode('cadastrar')||tssPode('liberar')||sstCanDownloadDocuments()"));
   async("(async()=>{const state=(await sstNativeHost.request({action:'state'}))[0].data;if(state.terceiros.length!==1)throw Error('Cadastro perdido');let denied=false;try{await sstNativeHost.request({action:'saveState',body:{p_data:state}})}catch(error){denied=true}if(!denied)throw Error('Portaria conseguiu gravar');await sstNativeHost.request({action:'documents',body:{action:'view',id:"+documentId+"}});let blocked=false;try{await sstNativeHost.request({action:'documents',body:{action:'download',id:"+documentId+"}})}catch(error){blocked=true}if(!blocked)throw Error('Download permitido');})()");
   screenshot("04-portaria");
   getInstrumentation().runOnMainSync(()->activity.finish());getInstrumentation().waitForIdleSync();Thread.sleep(1000);
   launch();waitFor("document.getElementById('tss-auth-form')&&!document.body.classList.contains('tss-authenticated')");
   assertEquals("null",js("document.getElementById('sst-native-initialize')"));
   js("document.getElementById('tss-auth-email').value='portaria@sst.local';document.getElementById('tss-auth-password').value="+JSONObject.quote(password)+";document.getElementById('tss-auth-form').requestSubmit()");
   waitFor("document.body.classList.contains('tss-authenticated')");
   async("sstNativeHost.request({action:'state'}).then(rows=>{if(rows[0].data.terceiros.length!==1)throw Error('Cadastro perdido ao reabrir')})");
  }finally{if(activity!=null)getInstrumentation().runOnMainSync(()->activity.finish());}
 }
}
