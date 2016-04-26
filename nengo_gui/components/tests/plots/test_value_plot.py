import os
import sys
import time
import traceback
from nengo_gui import conftest
from nengo_gui import testing_tools as tt


def test_value_plot(driver):
	try:
		stim_vals = [0, 1]
		accuracy = 0.3
		for val in stim_vals:
			tt.reset_page(driver)
			tt.update_editor(driver, """
import nengo

model = nengo.Network()
with model:
	stim = nengo.Node([{}])
	a = nengo.Ensemble(n_neurons=50, dimensions=1)
	nengo.Connection(stim, a)
			""".format(val))
			ens = driver.find_element_by_xpath('//*[@class="ens"]')
			stim = driver.find_element_by_xpath('//*[@class="node"]')
			tt.menu_click(driver, ens, 'Value')
			tt.menu_click(driver, stim, 'Slider')
			graph_elements = driver.find_elements_by_xpath('//*[@class="graph"]')

			tt.start_stop_sim(driver)
			time.sleep(4)
			data = driver.execute_script("""
			var ens = Nengo.Component.components[0];
			var data = ens.data_store.data[0];
			return data;
			""")[-100:]
			signal_acc = True
			assert(len(data) > 10)
			for signal in data:
				if(not(abs(float(signal)-val) < accuracy)):
					signal_acc = False
					break
			tt.start_stop_sim(driver)

			assert(signal_acc)

	except Exception as e:
		#Travis Only: On fail takes screenshot and uploads it to imgur


		if('TRAVIS' in os.environ):
			tt.imgur_screenshot(driver)

		_, _, tb = sys.exc_info()
		traceback.print_tb(tb) # Fixed format
		tb_info = traceback.extract_tb(tb)
		filename, line, func, text = tb_info[-1]

		print('An error occurred on line {} in statement {}'.format(line, text))
		print(str(e))
		exit(1)
